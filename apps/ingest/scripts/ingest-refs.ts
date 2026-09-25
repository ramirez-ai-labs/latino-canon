/**
 * Ingest specific canon.seed.json entries by ref. For entries that already exist in the
 * seed but need (re-)ingesting - a corrected tmdbId, a title that failed before -
 * which ingest-new-titles.yml never sends, since it only diffs for new refs. Send a few
 * per day: each new title costs 70B classify + blurb neurons (see README budget).
 *
 *   INGEST_URL=... INGEST_ADMIN_TOKEN=... pnpm --filter @latino-canon/ingest ingest:refs "Heli (2013)" "Araby (2017)"
 *
 * A title whose id already exists is skipped by the Workflow (no force), so re-sending a
 * live title costs nothing but TMDB calls.
 */
import { readFileSync } from "node:fs";
import { parseSeedFile } from "../src/seed-diff.js";
import { postTitlesInBatches } from "./lib/post-titles.js";

const refs = process.argv.slice(2);
const url = process.env.INGEST_URL;
const token = process.env.INGEST_ADMIN_TOKEN;
if (refs.length === 0 || !url || !token) {
  console.error('usage: INGEST_URL=... INGEST_ADMIN_TOKEN=... tsx scripts/ingest-refs.ts "<ref>" ...');
  process.exit(1);
}

const seed = parseSeedFile(readFileSync(new URL("../src/seed/canon.seed.json", import.meta.url), "utf8"));
const titles = refs.map((ref) => {
  const t = seed.find((s) => s.ref === ref);
  if (!t) {
    console.error(`not in canon.seed.json: "${ref}"`);
    process.exit(1);
  }
  return t;
});

postTitlesInBatches(url, token, titles).catch((e) => {
  console.error(e);
  process.exit(1);
});
