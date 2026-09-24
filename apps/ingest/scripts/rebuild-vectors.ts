/**
 * Re-embed every title into Vectorize, one page per request, using the same embedding
 * text + metadata as ingest (packages/core embedding.ts). Needed after anything that
 * changes what a vector is built from (genres, confident themes, synopsis) without
 * re-running the full ingest workflow. Idempotent - upserts by title id.
 *
 *   pnpm --filter @latino-canon/ingest rebuild:vectors [pageSize]
 *
 * Requires INGEST_ADMIN_TOKEN in the environment. Clear the search cache afterwards
 * (POST /rebuild-search-cache) so cached result pages don't outlive the old vectors.
 */
export {}; // module scope - keeps this script's top-level consts from colliding with sibling scripts'

const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";
const url = process.env.INGEST_URL ?? "http://localhost:8788";
const limit = Number(process.argv[2] ?? 50);

async function rebuildVectors(): Promise<void> {
  let offset: number | null = 0;
  while (offset !== null) {
    const res = await fetch(`${url}/rebuild-vectors`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ offset, limit }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`rebuild-vectors failed at offset ${offset}: ${res.status} ${text}`);
    const page = JSON.parse(text) as { embedded: number; total: number; nextOffset: number | null };
    console.log(`offset ${offset}: embedded ${page.embedded} (total ${page.total})`);
    offset = page.nextOffset;
  }
}

rebuildVectors().catch((e) => {
  console.error(e);
  process.exit(1);
});
