/**
 * CI entry point: validate a canon.seed.json change against the base branch's copy.
 * Used by .github/workflows/validate-pr.yml on every pull request, so a duplicate or an
 * unpinned new title fails review instead of reaching the ingest Workflow on merge.
 *
 *   tsx scripts/validate-seed.ts <base-seed.json> <head-seed.json>
 */
import { readFileSync } from "node:fs";
import { parseSeedFile, parseSeedRemovals } from "../src/seed-diff.js";
import { validateSeed } from "../src/seed-validate.js";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("usage: tsx scripts/validate-seed.ts <base-seed.json> <head-seed.json>");
  process.exit(1);
}

const readRaw = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return ""; // no base copy (first run) - parses as no titles
  }
};

const headRaw = readRaw(headFile);
const head = parseSeedFile(headRaw);
if (head.length === 0) {
  console.error(`${headFile}: no titles parsed - is the JSON valid?`);
  process.exit(1);
}

const errors = validateSeed(parseSeedFile(readRaw(baseFile)), head, parseSeedRemovals(headRaw));
if (errors.length > 0) {
  for (const e of errors) console.error(`::error file=apps/ingest/src/seed/canon.seed.json::${e}`);
  process.exit(1);
}
console.warn(`canon.seed.json: ${head.length} titles valid`);
