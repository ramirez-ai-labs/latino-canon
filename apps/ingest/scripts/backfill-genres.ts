/**
 * Backfill titles.genres from TMDB for rows ingested before that column existed.
 * TMDB-only (one /movie or /tv detail call per row, already fetched for credits - no
 * new API surface) - no Workers AI neurons spent. Safe to re-run: only ever touches
 * rows whose genres are still the '[]' default.
 *
 *   pnpm --filter @latino-canon/ingest backfill:genres [limit]
 *
 * Requires INGEST_ADMIN_TOKEN in the environment.
 */
export {}; // module scope - keeps this script's top-level consts from colliding with sibling scripts'

const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";
const url = process.env.INGEST_URL ?? "http://localhost:8788";
const limit = Number(process.argv[2] ?? 50);

async function backfillGenres(): Promise<void> {
  console.log(`Backfilling genres for up to ${limit} titles...`);

  const res = await fetch(`${url}/backfill-genres`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ limit }),
  });

  const text = await res.text();
  console.log(`Response (${res.status}):`, text);

  if (!res.ok) throw new Error(`backfill-genres request failed: ${res.status} ${text}`);
}

backfillGenres().catch((e) => {
  console.error(e);
  process.exit(1);
});
