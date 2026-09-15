/**
 * Backfill people.gender for rows ingested before that column existed. TMDB-only
 * (one /person/{id} call per row) - no Workers AI neurons spent. Safe to re-run: only
 * ever touches rows still missing a gender, so it naturally stops finding work once the
 * backlog is cleared.
 *
 *   pnpm --filter @latino-canon/ingest backfill:gender [limit]
 *
 * Requires INGEST_ADMIN_TOKEN in the environment.
 */
const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";
const url = process.env.INGEST_URL ?? "http://localhost:8788";
const limit = Number(process.argv[2] ?? 50);

async function backfillGender(): Promise<void> {
  console.log(`Backfilling gender for up to ${limit} people...`);

  const res = await fetch(`${url}/backfill-gender`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ limit }),
  });

  const text = await res.text();
  console.log(`Response (${res.status}):`, text);

  if (!res.ok) throw new Error(`backfill-gender request failed: ${res.status} ${text}`);
}

backfillGender().catch((e) => {
  console.error(e);
  process.exit(1);
});
