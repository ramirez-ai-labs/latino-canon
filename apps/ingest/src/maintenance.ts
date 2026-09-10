import type { Env } from "./bindings.js";

/** Cron: re-queue jobs that errored, capped so a poison job can't loop forever. */
export async function retryErroredJobs(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT id, title_ref FROM ingest_jobs WHERE status = 'error' AND attempts < 3 LIMIT 25",
  ).all<{ id: string; title_ref: string }>();

  for (const job of results) {
    // TODO: reconstruct IngestParams from title_ref (or store params JSON on the job row)
    // and call env.INGEST_WORKFLOW.create({ params }).
    await env.DB.prepare("UPDATE ingest_jobs SET attempts = attempts + 1 WHERE id = ?").bind(job.id).run();
  }
}

/** Cron: refresh popularity / ratings for titles not touched in 30 days. */
export async function refreshPopularity(env: Env): Promise<void> {
  // TODO: page through stale titles, re-fetch TMDB popularity, UPDATE titles.
  void env;
}
