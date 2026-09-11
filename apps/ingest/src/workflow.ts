import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { MODEL_TAG_DISPLAY_THRESHOLD } from "@latino-canon/core";
import type { Env, IngestParams } from "./bindings.js";
import { resolveTmdbId, fetchTmdbDetails } from "./sources/tmdb.js";
import { fetchOmdbRatings } from "./sources/omdb.js";
import { normalizeTitle } from "./normalize.js";
import { persistTitle, upsertVector, writeTags, writeBlurb, setJob } from "./persist.js";
import { cachePoster } from "./poster.js";
import { classifyForIngest, blurbForIngest } from "./ai.js";

/**
 * Durable ingestion pipeline. Each step is independently retried; a failure in
 * `classify` never re-fetches TMDB. State between steps is the step's return value.
 *
 * Free-tier notes:
 *  - Workflows are free-tier eligible (Queues are not).
 *  - classify + blurb are the expensive steps (LLM). Run ingestion in small batches
 *    so Workers AI neurons/day isn't blown in one go; the cron picks up the rest.
 */
export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep): Promise<void> {
    const p = event.payload;
    const jobId = `job_${p.ref.replace(/\W+/g, "_").toLowerCase()}`;
    await step.do("register job", () => setJob(this.env, jobId, p.ref, "resolve", "running"));

    const tmdbId = await step.do("resolve tmdb id", { retries: { limit: 3, delay: "5 seconds" } }, () =>
      resolveTmdbId(this.env, p.title, p.year, p.kind),
    );

    const raw = await step.do("fetch metadata", { retries: { limit: 3, delay: "10 seconds" } }, async () => {
      const details = await fetchTmdbDetails(this.env, tmdbId, p.kind);
      const ratings = await fetchOmdbRatings(this.env, details.imdbId).catch(() => null);
      return { details, ratings };
    });

    const title = await step.do("normalize", async () => normalizeTitle(p, raw.details, raw.ratings));

    const exists = await step.do("check exists", async () => {
      const row = await this.env.DB.prepare("SELECT id FROM titles WHERE id = ?").bind(title.id).first();
      return Boolean(row);
    });
    if (exists && !p.force) {
      await step.do("skip", () => setJob(this.env, jobId, p.ref, "persist", "done"));
      return;
    }

    await step.do("persist title", () => persistTitle(this.env, title));

    await step.do("cache poster", () =>
      raw.details.posterPath ? cachePoster(this.env, title.id, raw.details.posterPath) : Promise.resolve(),
    );

    // --- AI steps -----------------------------------------------------------
    const classification = await step.do(
      "classify inclusion + themes",
      { retries: { limit: 2, delay: "30 seconds" } },
      () => classifyForIngest(this.env, title),
    );

    await step.do("write tags", () =>
      writeTags(this.env, title.id, {
        classification,
        seedInclusionTypes: p.seedInclusionTypes ?? [],
      }),
    );

    await step.do("embed + upsert vector", { retries: { limit: 3, delay: "10 seconds" } }, () =>
      upsertVector(this.env, title, classification.themes.map((t) => t.theme)),
    );

    const blurb = await step.do(
      "generate blurb",
      { retries: { limit: 2, delay: "30 seconds" } },
      () => blurbForIngest(this.env, title, classification),
    );
    await step.do("write blurb (unapproved)", () => writeBlurb(this.env, title.id, blurb));

    // --- Route to human review when the model isn't confident ---------------
    const lowConfidence =
      classification.inclusionTypes.length === 0 ||
      classification.inclusionTypes.every((t) => t.confidence < MODEL_TAG_DISPLAY_THRESHOLD);

    await step.do("finalize job", () =>
      setJob(this.env, jobId, p.ref, "review", lowConfidence ? "needs_review" : "done"),
    );
  }
}
