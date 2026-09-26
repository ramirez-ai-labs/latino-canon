import type { Env, IngestParams } from "./bindings.js";
import { fetchTmdbDetails } from "./sources/tmdb.js";
import { isStaleRetry, seedTitles } from "./ingest-queue.js";

/**
 * Cron: re-queue jobs that errored, capped so a poison job can't loop forever.
 *
 * Replays the *exact* IngestParams stored on the job row at "register job" time -
 * never reconstructs them from title_ref (a lossy "Title (Year)" string with no
 * kind/tmdbId/seedInclusionTypes). Guessing those from scratch is exactly what
 * corrupted an unrelated title (Firefly) this project has already hit once; see
 * docs/operations/monitoring.md's incident #2.
 */
export async function retryErroredJobs(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT id, params FROM ingest_jobs WHERE status = 'error' AND attempts < 3 LIMIT 25",
  ).all<{ id: string; params: string | null }>();

  for (const job of results) {
    // Bump attempts regardless of outcome below - this is what makes the `attempts < 3`
    // cap in the query above actually stop retrying a poison job after 3 tries.
    await env.DB.prepare("UPDATE ingest_jobs SET attempts = attempts + 1 WHERE id = ?").bind(job.id).run();

    if (!job.params) {
      // Pre-migration row with nothing safe to replay automatically - leave it for a
      // human rather than guess. See the module comment above.
      continue;
    }

    let params: IngestParams;
    try {
      params = JSON.parse(job.params) as IngestParams;
    } catch {
      continue; // corrupt params column - not this function's job to fix, leave for a human
    }

    // The seed has since re-pinned this title - the ingest queue ingests the new pin.
    if (isStaleRetry(params, seedTitles())) continue;

    // force:true because the earlier attempt may have already persisted a partial
    // row before failing later in the pipeline (e.g. classify/embed/blurb) - without
    // it, "check exists" would just skip and this retry would be a silent no-op.
    await env.INGEST_WORKFLOW.create({ params: { ...params, force: true } });
  }
}

/**
 * Cron: refresh popularity for titles not touched in 30+ days, oldest first, so a
 * fixed-size daily batch eventually rotates through the whole catalog rather than
 * always hitting the same titles.
 */
export async function refreshPopularity(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, tmdb_id, kind FROM titles
     WHERE tmdb_id IS NOT NULL AND updated_at < datetime('now', '-30 days')
     ORDER BY updated_at ASC LIMIT 25`,
  ).all<{ id: string; tmdb_id: number; kind: "film" | "series" }>();

  for (const title of results) {
    try {
      const details = await fetchTmdbDetails(env, title.tmdb_id, title.kind);
      // updated_at reset here is what makes this a rotation, not a fixed top-25 -
      // this title won't be selected again until the other stale titles catch up.
      await env.DB.prepare("UPDATE titles SET popularity = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(details.popularity, title.id)
        .run();
    } catch (err) {
      // One bad TMDB lookup (e.g. a since-removed id) shouldn't abort the whole
      // batch - same reasoning as the groundedness eval's own per-title try/catch.
      console.warn(`[refreshPopularity] ${title.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
