/**
 * Creates the Cloudflare resources and patches the ids into the wrangler.jsonc files.
 * Idempotent-ish: skips creation when `wrangler ... list` already shows the resource.
 *
 *   pnpm infra:create
 *
 * Requires: authenticated wrangler (`wrangler login`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (args: string[]) => execFileSync("wrangler", args, { encoding: "utf8" });

function patch(file: string, replacements: [RegExp, string][]) {
  let text = readFileSync(file, "utf8");
  for (const [re, val] of replacements) text = text.replace(re, val);
  writeFileSync(file, text);
  console.log(`patched ${file}`);
}

function main() {
  console.log("Creating D1…");
  const d1 = run(["d1", "create", "latino-canon"]);
  const d1Id = d1.match(/database_id"?\s*[:=]\s*"?([a-f0-9-]{36})/i)?.[1];
  if (!d1Id) throw new Error(`could not parse d1 id from:\n${d1}`);

  console.log("Creating Vectorize…");
  run(["vectorize", "create", "latino-canon-titles", "--dimensions=1024", "--metric=cosine"]);
  for (const [prop, type] of [
    ["kind", "string"],
    ["decade", "number"],
    ["themes", "string"],
    ["inclusionTypes", "string"],
  ]) {
    run(["vectorize", "create-metadata-index", "latino-canon-titles", `--property-name=${prop}`, `--type=${type}`]);
  }

  console.log("Creating KV…");
  const kv = run(["kv", "namespace", "create", "CACHE"]);
  const kvId = kv.match(/id\s*[:=]\s*"?([a-f0-9]{32})/i)?.[1];

  console.log("Creating R2…");
  run(["r2", "bucket", "create", "latino-canon-posters"]);

  console.log("Creating AI Gateway…");
  try {
    run(["ai-gateway", "create", "latino-canon"]);
  } catch {
    console.log("  (gateway may already exist — skipping)");
  }

  patch("apps/api/wrangler.jsonc", [
    [/REPLACE_WITH_D1_ID/g, d1Id],
    [/REPLACE_WITH_KV_ID/g, kvId ?? "REPLACE_WITH_KV_ID"],
  ]);
  patch("apps/ingest/wrangler.jsonc", [[/REPLACE_WITH_D1_ID/g, d1Id]]);

  console.log("\nDone. Next: set secrets (infra/README.md §6), then `pnpm --filter @latino-canon/api db:migrate:remote`.");
}

main();
