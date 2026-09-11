/**
 * Push the seed list through the ingest Workflow.
 *   pnpm --filter @latino-canon/ingest seed            # local wrangler dev on :8788
 *   INGEST_URL=https://latino-canon-ingest.<acct>.workers.dev pnpm ... seed   # remote
 *
 * Requires INGEST_ADMIN_TOKEN in the environment (matches the worker secret / .dev.vars).
 */
import seed from "../src/seed/canon.seed.json" with { type: "json" };
import { postTitlesInBatches, type SeedTitle } from "./lib/post-titles.js";

const url = process.env.INGEST_URL ?? "http://localhost:8788";
const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";

postTitlesInBatches(url, token, seed.titles as SeedTitle[]).catch((e) => {
  console.error(e);
  process.exit(1);
});
