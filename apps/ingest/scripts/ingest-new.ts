/**
 * CI entry point: diff two canon.seed.json snapshots and POST only the newly added
 * titles to the deployed ingest worker. Used by
 * .github/workflows/ingest-new-titles.yml on every push to main that touches the seed
 * file, so adding a title to the canon is "open a PR" - not a manual curl/CLI step.
 *
 *   tsx scripts/ingest-new.ts <base-seed.json> <head-seed.json>
 *
 * Requires INGEST_URL + INGEST_ADMIN_TOKEN in the environment.
 */
import { readFileSync } from "node:fs";
import { diffNewTitles, parseSeedFile } from "../src/seed-diff.js";
import { postTitlesInBatches } from "./lib/post-titles.js";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("usage: tsx scripts/ingest-new.ts <base-seed.json> <head-seed.json>");
  process.exit(1);
}

const url = process.env.INGEST_URL;
const token = process.env.INGEST_ADMIN_TOKEN;
if (!url || !token) {
  console.error("INGEST_URL and INGEST_ADMIN_TOKEN must be set");
  process.exit(1);
}

function readSeed(path: string): ReturnType<typeof parseSeedFile> {
  try {
    return parseSeedFile(readFileSync(path, "utf8"));
  } catch {
    return []; // base snapshot legitimately won't exist on the very first run
  }
}

async function main(baseFile: string, headFile: string, url: string, token: string) {
  const added = diffNewTitles(readSeed(baseFile), readSeed(headFile));

  if (added.length === 0) {
    console.log("no new titles in canon.seed.json - nothing to ingest");
    return;
  }

  console.log(`queuing ${added.length} new title(s): ${added.map((t) => t.ref).join(", ")}`);
  await postTitlesInBatches(url, token, added);
}

main(baseFile, headFile, url, token).catch((e) => {
  console.error(e);
  process.exit(1);
});
