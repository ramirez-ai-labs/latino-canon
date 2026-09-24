/**
 * Retrieval eval: replays the golden query set against a running api worker and prints
 * overall + per-category scores for each mode.
 *
 *   API_URL=http://localhost:8787 pnpm eval:retrieval
 *   API_URL=https://latino-canon-api.<acct>.workers.dev pnpm eval:retrieval
 *
 * Env:
 *   MODES=hybrid           comma list (default lexical,semantic,hybrid). The deploy gate
 *                          runs hybrid only - it's the mode users get, and a third of the
 *                          AI budget of all three.
 *   RECORD=1               write .eval-out/insert.sql for eval_runs (applied by CI).
 *   GATE=1                 exit 1 if hybrid recall@5 dropped more than MAX_DROP against
 *                          the last recorded run on the same golden set.
 *   MAX_DROP=0.03          see eval-retrieval.yml for how this was chosen.
 *
 * Writes .eval-out/retrieval-<timestamp>.json for tracking over time.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EvalRun, SearchMode, SearchResponse } from "@latino-canon/core";
import { aggregate } from "./metrics.js";
import { byCategory, checkGate, goldenSetHash, type GoldQuery, type PerQuery } from "./gate.js";
import { writeEvalRunSql } from "./record-run.js";

const API_URL = process.env.API_URL ?? "http://localhost:8787";
const MODES = (process.env.MODES ?? "lexical,semantic,hybrid").split(",").map((m) => m.trim()) as SearchMode[];
const RECORD = process.env.RECORD === "1";
const GATE = process.env.GATE === "1";
const MAX_DROP = Number(process.env.MAX_DROP ?? 0.03);

function loadQueries(): GoldQuery[] {
  const path = fileURLToPath(new URL("./datasets/queries.jsonl", import.meta.url));
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldQuery);
}

async function searchOnce(url: string): Promise<SearchResponse> {
  // One retry: a single transient 5xx shouldn't fail a deploy gate, a persistent one should.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as SearchResponse;
    if (attempt >= 1) throw new Error(`GET ${url} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function runMode(mode: SearchMode, queries: GoldQuery[]) {
  const perQuery: PerQuery[] = [];
  for (const q of queries) {
    const res = await searchOnce(`${API_URL}/search?q=${encodeURIComponent(q.query)}&mode=${mode}&limit=10`);
    perQuery.push({ id: q.id, category: q.category, ranked: res.results.map((r) => r.id), relevant: q.relevant });
  }
  return { mode, scores: aggregate(perQuery), categories: byCategory(perQuery), perQuery };
}

/**
 * Last recorded retrieval run on the same golden set that didn't fail the gate. Failed
 * runs are recorded (the history should show them) but never become the baseline -
 * otherwise one regressed deploy would lower the bar for every deploy after it.
 */
async function lastComparableRecall(hash: string): Promise<number | null> {
  const res = await fetch(`${API_URL}/eval-runs?type=retrieval&limit=50`);
  if (!res.ok) throw new Error(`GET /eval-runs -> ${res.status}`);
  const { runs } = (await res.json()) as { runs: EvalRun[] };
  const match = runs.find((r) => {
    const d = r.details as { goldenSetHash?: string; gate?: { pass: boolean } } | null;
    return d?.goldenSetHash === hash && d.gate?.pass !== false && r.metrics["hybrid.recall@5"] !== undefined;
  });
  return match?.metrics["hybrid.recall@5"] ?? null;
}

const fmt = (n: number) => n.toFixed(3);

async function main() {
  const queries = loadQueries();
  const hash = goldenSetHash(queries);
  const results = [];
  for (const mode of MODES) results.push(await runMode(mode, queries));

  console.log(`golden set ${hash}: ${queries.length} queries`);
  console.table(
    Object.fromEntries(
      results.map((r) => [
        r.mode,
        {
          "recall@5": fmt(r.scores["recall@5"]),
          "recall@10": fmt(r.scores["recall@10"]),
          "P@5": fmt(r.scores["precision@5"]),
          MRR: fmt(r.scores.mrr),
          "nDCG@10": fmt(r.scores["ndcg@10"]),
        },
      ]),
    ),
  );

  const hybrid = results.find((r) => r.mode === "hybrid");
  if (hybrid) {
    console.log("\nhybrid by category:");
    console.table(
      Object.fromEntries(
        Object.entries(hybrid.categories).map(([c, s]) => [c, { n: s.n, "recall@5": fmt(s["recall@5"]), MRR: fmt(s.mrr) }]),
      ),
    );
    const misses = hybrid.perQuery.filter((q) => !q.ranked.slice(0, 5).some((id) => q.relevant.includes(id)));
    if (misses.length) {
      console.log("\nhybrid misses (no relevant hit in top 5):");
      for (const m of misses) console.log(`  ${m.id} [${m.category}]  got: ${m.ranked.slice(0, 3).join(", ") || "—"}`);
    }
  }

  mkdirSync(".eval-out", { recursive: true });
  const out = `.eval-out/retrieval-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify({ API_URL, goldenSetHash: hash, results }, null, 2));
  console.log(`\nwrote ${out}`);

  // Baseline is read before this run is recorded, so a run never compares against itself.
  const gate = hybrid && GATE ? checkGate(hybrid.scores["recall@5"], await lastComparableRecall(hash), MAX_DROP) : null;

  if (RECORD) {
    const metrics: Record<string, number> = { queries: queries.length };
    for (const r of results) {
      for (const [k, v] of Object.entries(r.scores)) if (k !== "n") metrics[`${r.mode}.${k}`] = v;
      for (const [c, s] of Object.entries(r.categories)) {
        metrics[`${r.mode}.recall@5.${c}`] = s["recall@5"];
        metrics[`${r.mode}.mrr.${c}`] = s.mrr;
      }
    }
    const primary = hybrid ?? results[0]!;
    writeEvalRunSql(".eval-out/insert.sql", {
      evalType: "retrieval",
      runAt: new Date().toISOString(),
      n: queries.length,
      failed: 0,
      meanScore: primary.scores["recall@5"],
      metrics,
      details: {
        goldenSetHash: hash,
        modes: MODES,
        gate,
        misses: primary.perQuery
          .filter((q) => !q.ranked.slice(0, 5).some((id) => q.relevant.includes(id)))
          .map((q) => ({ id: q.id, category: q.category, got: q.ranked.slice(0, 3) })),
      },
    });
    console.log("wrote .eval-out/insert.sql");
  }

  if (gate) {
    if (gate.baseline === null) {
      console.log(`\ngate: no earlier run on golden set ${hash} - this run is the baseline (recall@5 ${fmt(gate.current)})`);
    } else {
      const verdict = gate.pass ? "PASS" : "FAIL";
      console.log(
        `\ngate: ${verdict} - hybrid recall@5 ${fmt(gate.current)} vs baseline ${fmt(gate.baseline)} (${gate.delta! >= 0 ? "+" : ""}${fmt(gate.delta!)}, max drop ${MAX_DROP})`,
      );
      if (!gate.pass) process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
