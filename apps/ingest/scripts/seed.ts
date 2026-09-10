/**
 * Push the seed list through the ingest Workflow.
 *   pnpm --filter @latino-canon/ingest seed            # local wrangler dev on :8788
 *   INGEST_URL=https://latino-canon-ingest.<acct>.workers.dev pnpm ... seed   # remote
 *
 * Requires INGEST_ADMIN_TOKEN in the environment (matches the worker secret / .dev.vars).
 */
import seed from "../src/seed/canon.seed.json" with { type: "json" };

const url = process.env.INGEST_URL ?? "http://localhost:8788";
const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";

const BATCH = 4; // keep Workers AI neurons/day in budget; cron mops up the rest

async function main() {
  const titles = seed.titles;
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const res = await fetch(`${url}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ titles: chunk }),
    });
    console.log(`batch ${i / BATCH + 1}:`, res.status, await res.text());
    if (i + BATCH < titles.length) await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
