/**
 * Backfill titles.content_advisory for rows ingested before that column existed.
 * LLM-classified (one small-model call per row) from the synopsis already in D1 - no
 * TMDB re-fetch. Safe to re-run: only ever touches rows still NULL, same
 * "null = not backfilled yet" convention as /backfill-gender.
 *
 *   pnpm --filter @latino-canon/ingest backfill:content-advisory [limit]
 *
 * Requires INGEST_ADMIN_TOKEN in the environment.
 */
export {}; // module scope - keeps this script's top-level consts from colliding with sibling scripts'

const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";
const url = process.env.INGEST_URL ?? "http://localhost:8788";
const limit = Number(process.argv[2] ?? 50);

async function backfillContentAdvisory(): Promise<void> {
  console.log(`Backfilling content advisory for up to ${limit} titles...`);

  const res = await fetch(`${url}/backfill-content-advisory`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ limit }),
  });

  const text = await res.text();
  console.log(`Response (${res.status}):`, text);

  if (!res.ok) throw new Error(`backfill-content-advisory request failed: ${res.status} ${text}`);
}

backfillContentAdvisory().catch((e) => {
  console.error(e);
  process.exit(1);
});
