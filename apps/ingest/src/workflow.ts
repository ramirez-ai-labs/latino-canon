import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { GROUNDEDNESS_JUDGE_VERSION, passesBlurbGate, type GroundednessVerdict } from "@latino-canon/core";
import type { Env, IngestParams } from "./bindings.js";
import { resolveTmdbId, fetchTmdbDetails } from "./sources/tmdb.js";
import { fetchOmdbRatings } from "./sources/omdb.js";
import { normalizeTitle } from "./normalize.js";
import {
  persistTitle,
  upsertVector,
  writeTags,
  writeAliases,
  writeBlurb,
  writeContentAdvisory,
  recordBlurbVerdict,
  setJob,
} from "./persist.js";
import { cachePoster } from "./poster.js";
import { classifyForIngest, classifyContentAdvisory, blurbForIngest, judgeBlurb } from "./ai.js";
import { jobIdFor, isTitleMismatch, isYearMismatch, needsHumanReview, confidentThemes } from "./workflow-rules.js";

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

      // VALIDATION GATE: the resolved title must be the seed's title, not a namesake from
      // another decade - see isYearMismatch for the incidents behind this.
      if (isYearMismatch(p.year, raw.details.releaseYear)) {
        const found = `"${raw.details.title}" (${raw.details.releaseYear}), expected "${p.title}" (${p.year})`;
        await step.do("skip year mismatch", () =>
          setJob(
            this.env,
            jobId,
            p.ref,
            "validate",
            "error",
            p.tmdbId
              ? `Pinned tmdbId ${p.tmdbId} resolves to ${found} - check the seed entry's tmdbId`
              : `TMDB search matched ${found} - pin the right tmdbId in the seed entry`,
          ),
        );
        return;
      }

      // VALIDATION GATE: ...and it must be the seed's title by name, not just by era - a
      // wrong pinned id from the same years passes the year check (see isTitleMismatch).
      const seedNames = [p.title, ...(p.aliases ?? []).map((a) => a.alias)];
      if (isTitleMismatch(seedNames, raw.details.title, raw.details.originalTitle)) {
        const found = `"${raw.details.title}" / "${raw.details.originalTitle}"`;
        await step.do("skip title mismatch", () =>
          setJob(
            this.env,
            jobId,
            p.ref,
            "validate",
            "error",
            `${p.tmdbId ? `Pinned tmdbId ${p.tmdbId}` : "TMDB search"} resolves to ${found}, which doesn't resemble "${p.title}" or its aliases - check the tmdbId, or add the title TMDB uses as an alias`,
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

      if (p.aliases?.length) {
        await step.do("write aliases", () => writeAliases(this.env, title.id, p.aliases!));
      }

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

      const contentAdvisory = await step.do(
        "classify content advisory",
        { retries: { limit: 2, delay: "30 seconds" } },
        () => classifyContentAdvisory(this.env, { title: title.title, year: title.yearStart, synopsis: title.synopsis }),
      );
      await step.do("write content advisory", () => writeContentAdvisory(this.env, title.id, contentAdvisory));

      stage = "embed";
      await step.do("embed + upsert vector", { retries: { limit: 3, delay: "10 seconds" } }, () =>
        upsertVector(this.env, title, confidentThemes(classification.themes)),
      );

      stage = "blurb";
      const blurb = await step.do(
        "generate blurb",
        { retries: { limit: 2, delay: "30 seconds" } },
        () => blurbForIngest(this.env, title, classification, raw.ratings?.awards ?? null),
      );
      await step.do("write blurb (unapproved)", () => writeBlurb(this.env, title.id, blurb));

      // Approval gate: the v3 judge reads the blurb against its sources, and a fully
      // supported blurb is approved here instead of waiting for an editor - the daily
      // queue was adding ~15 unapproved blurbs a day to a backlog of 63. A judge failure
      // (its retries exhausted, or a reply with no JSON) leaves the blurb unapproved for
      // an editor, the pre-gate behavior; it never fails the ingest.
      stage = "judge";
      let verdict: GroundednessVerdict | null = null;
      try {
        verdict = await step.do("judge blurb", { retries: { limit: 2, delay: "30 seconds" } }, () =>
          judgeBlurb(this.env, blurb),
        );
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "ingest.blurb_judge",
            titleId: title.id,
            outcome: "judge_failed",
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      if (verdict) {
        const judged = verdict;
        const pass = passesBlurbGate(judged);
        await step.do("record blurb verdict", () =>
          recordBlurbVerdict(this.env, title.id, blurb.result.text, {
            score: judged.score,
            judgeVersion: GROUNDEDNESS_JUDGE_VERSION,
            pass,
          }),
        );
        console.warn(
          JSON.stringify({
            event: "ingest.blurb_judge",
            titleId: title.id,
            outcome: pass ? "approved" : "held",
            score: judged.score,
            unsupported: judged.unsupported,
          }),
        );
      }

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
