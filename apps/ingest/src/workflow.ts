import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, IngestParams } from "./bindings.js";
import { resolveTmdbId, fetchTmdbDetails } from "./sources/tmdb.js";
import { fetchOmdbRatings } from "./sources/omdb.js";
import { normalizeTitle } from "./normalize.js";
import { persistTitle, upsertVector, writeTags, writeBlurb, setJob } from "./persist.js";
import { cachePoster } from "./poster.js";
import { classifyForIngest, blurbForIngest } from "./ai.js";
import { jobIdFor, isYearMismatch, needsHumanReview } from "./workflow-rules.js";

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
    const jobId = jobIdFor(p.ref);
    await step.do("register job", () => setJob(this.env, jobId, p.ref, "resolve", "running", null, p));

    // Tracks which stage we're in so a caught failure can record *where* it happened -
    // ingest_jobs.status otherwise stays stuck at "running" forever (set once here, never
    // updated again unless the run reaches "finalize job"), and GET /jobs - the review
    // queue this exists for - only surfaces status IN ('needs_review','error'). A stuck
    // "running" row is invisible to it.
    let stage = "resolve";
    try {
      // A plain title+year search can't disambiguate two different films that share
      // both (e.g. two unrelated 2026 movies both titled "Ashes") - p.tmdbId lets the
      // seed pin the exact id when that collision is a real, checked risk rather than
      // a hypothetical one.
      const tmdbId = await step.do("resolve tmdb id", { retries: { limit: 3, delay: "5 seconds" } }, () =>
        p.tmdbId ? Promise.resolve(p.tmdbId) : resolveTmdbId(this.env, p.title, p.year, p.kind),
      );

      stage = "fetch";
      const raw = await step.do("fetch metadata", { retries: { limit: 3, delay: "10 seconds" } }, async () => {
        const details = await fetchTmdbDetails(this.env, tmdbId, p.kind);
        const ratings = await fetchOmdbRatings(this.env, details.imdbId).catch(() => null);
        return { details, ratings };
      });

      // VALIDATION GATE: Skip adult content
      if (raw.details.adult) {
        await step.do("skip adult content", () =>
          setJob(this.env, jobId, p.ref, "validate", "error", "Content flagged as adult (TMDB adult=true); excluded per curation policy")
        );
        return;
      }

      // VALIDATION GATE: a pinned tmdbId skips search entirely, so nothing else checks
      // it actually points at the right title. Found the hard way: El Chavo del 8
      // (1973)'s seed entry had a wrong tmdbId that actually resolves to Firefly
      // (2002) - an unrelated title that already existed in the catalog - and a
      // force:true re-ingest silently overwrote Firefly's real tags with El Chavo's
      // seedInclusionTypes because nothing here ever compared the fetched year against
      // what the seed/caller expected. A release-year mismatch this large can only
      // mean the pinned id is wrong, not that TMDB's data is imprecise.
      if (isYearMismatch(p.tmdbId, p.year, raw.details.releaseYear)) {
        await step.do("skip year mismatch", () =>
          setJob(
            this.env,
            jobId,
            p.ref,
            "validate",
            "error",
            `Pinned tmdbId ${p.tmdbId} resolves to "${raw.details.title}" (${raw.details.releaseYear}), expected "${p.title}" (${p.year}) - check the seed entry's tmdbId`,
          ),
        );
        return;
      }

      const title = await step.do("normalize", async () => normalizeTitle(p, raw.details, raw.ratings));

      const exists = await step.do("check exists", async () => {
        const row = await this.env.DB.prepare("SELECT id FROM titles WHERE id = ?").bind(title.id).first();
        return Boolean(row);
      });
      if (exists && !p.force) {
        await step.do("skip", () => setJob(this.env, jobId, p.ref, "persist", "done"));
        return;
      }

      stage = "persist";
      await step.do("persist title", () => persistTitle(this.env, title));

      await step.do("cache poster", () =>
        raw.details.posterPath ? cachePoster(this.env, title.id, raw.details.posterPath) : Promise.resolve(),
      );

      // --- AI steps -----------------------------------------------------------
      stage = "classify";
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

      stage = "embed";
      await step.do("embed + upsert vector", { retries: { limit: 3, delay: "10 seconds" } }, () =>
        upsertVector(this.env, title, (classification.themes ?? []).map((t) => t.theme)),
      );

      stage = "blurb";
      const blurb = await step.do(
        "generate blurb",
        { retries: { limit: 2, delay: "30 seconds" } },
        () => blurbForIngest(this.env, title, classification),
      );
      await step.do("write blurb (unapproved)", () => writeBlurb(this.env, title.id, blurb));

      // --- Route to human review when the model isn't confident ---------------
      const lowConfidence = needsHumanReview(p.seedInclusionTypes, classification.inclusionTypes);

      await step.do("finalize job", () =>
        setJob(this.env, jobId, p.ref, "review", lowConfidence ? "needs_review" : "done"),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await step.do("record failure", () => setJob(this.env, jobId, p.ref, stage, "error", message));
      throw err; // still let the Workflow itself terminate in an errored state
    }
  }
}
