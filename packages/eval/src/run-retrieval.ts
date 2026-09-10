/**
 * Retrieval eval: replays the golden query set against a running api worker in all
 * three modes and prints a comparison table.
 *
 *   API_URL=http://localhost:8787 pnpm eval:retrieval
 *   API_URL=https://latino-canon-api.<acct>.workers.dev pnpm eval:retrieval
 *
 * Writes .eval-out/retrieval-<timestamp>.json for tracking over time.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SearchMode, SearchResponse } from "@latino-canon/core";
import { aggregate } from "./metrics.js";

const API_URL = process.env.API_URL ?? "http://localhost:8787";
const MODES: SearchMode[] = ["lexical", "semantic", "hybrid"];

interface GoldQuery {
  id: string;
  query: string;
  relevant: string[];
  note?: string;
}

function loadQueries(): GoldQuery[] {
  const path = fileURLToPath(new URL("./datasets/queries.jsonl", import.meta.url));
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldQuery);
}

async function runMode(mode: SearchMode, queries: GoldQuery[]) {
  const perQuery: { id: string; ranked: string[]; relevant: string[] }[] = [];
  for (const q of queries) {
    const url = `${API_URL}/search?q=${encodeURIComponent(q.query)}&mode=${mode}&limit=10`;
    const res = (await fetch(url).then((r) => r.json())) as SearchResponse;
    perQuery.push({ id: q.id, ranked: res.results.map((r) => r.id), relevant: q.relevant });
  }
  return { mode, scores: aggregate(perQuery), perQuery };
}

async function main() {
  const queries = loadQueries();
  const results = [];
  for (const mode of MODES) results.push(await runMode(mode, queries));

  console.table(
    Object.fromEntries(
      results.map((r) => [
        r.mode,
        {
          "recall@5": r.scores["recall@5"].toFixed(3),
          "recall@10": r.scores["recall@10"].toFixed(3),
          "P@5": r.scores["precision@5"].toFixed(3),
          MRR: r.scores.mrr.toFixed(3),
          "nDCG@10": r.scores["ndcg@10"].toFixed(3),
        },
      ]),
    ),
  );

  // Per-query misses for hybrid — where to focus error analysis.
  const hybrid = results.find((r) => r.mode === "hybrid");
  const misses = hybrid?.perQuery.filter((q) => !q.ranked.slice(0, 5).some((id) => q.relevant.includes(id)));
  if (misses?.length) {
    console.log("\nhybrid misses (no relevant hit in top 5):");
    for (const m of misses) console.log(`  ${m.id}  got: ${m.ranked.slice(0, 3).join(", ") || "—"}`);
  }

  mkdirSync(".eval-out", { recursive: true });
  const out = `.eval-out/retrieval-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify({ API_URL, results }, null, 2));
  console.log(`\nwrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
