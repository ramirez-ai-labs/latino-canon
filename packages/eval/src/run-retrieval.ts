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
 *                          Workers AI neurons of all three. All modes run weekly.
 *   RECORD=1               write .eval-out/insert.sql for eval_runs (applied by CI).
 *   GATE=1                 exit 1 if hybrid recall@5 dropped more than MAX_DROP against
 *                          the last recorded run on the same golden set.
 *   MAX_DROP=0.03          see eval-retrieval.yml for how this was chosen.
 *   REBASELINE="<reason>"  accept this run as the new baseline whatever the drop - for a
 *                          drop caused by catalog growth, not code (see checkGate).
 *
 * Writes .eval-out/retrieval-<timestamp>.json for tracking over time.
 */
import { setTimeout as sleep } from "node:timers/promises";
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
const REBASELINE = process.env.REBASELINE?.trim() ? { reason: process.env.REBASELINE.trim() } : undefined;
const MAX_RATE_LIMIT_WAITS = 20; // 77 queries x 3 modes at 30/min needs ~7; well past that, something's wrong

function loadQueries(): GoldQuery[] {
  const path = fileURLToPath(new URL("./datasets/queries.jsonl", import.meta.url));
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldQuery);
}

async function searchOnce(url: string): Promise<SearchResponse> {
  // One retry: a single transient 5xx shouldn't fail a deploy gate, a persistent one should.
  // A 429 isn't a failure - the api rate-limits every caller, this one included, so wait
  // out the window. A degraded (keyword-only) response is one: scoring it would record an
  // AI outage as a retrieval regression.
  for (let attempt = 0, waits = 0; ; ) {
    const res = await fetch(url);
    if (res.status === 429 && waits < MAX_RATE_LIMIT_WAITS) {
      waits++;
      await sleep(Number(res.headers.get("retry-after") ?? 60) * 1000);
      continue;
    }
    if (res.ok) {
      const body = (await res.json()) as SearchResponse;
      if (!body.degraded) return body;
      if (attempt++ >= 1) throw new Error(`GET ${url} -> degraded (semantic retrieval unavailable); not scoring`);
      continue;
    }
    if (attempt++ >= 1) throw new Error(`GET ${url} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
async function lastComparableRun(hash: string): Promise<{ recall: number; catalogSize?: number } | null> {
  const res = await fetch(`${API_URL}/eval-runs?type=retrieval&limit=50`);
  if (!res.ok) throw new Error(`GET /eval-runs -> ${res.status}`);
  const { runs } = (await res.json()) as { runs: EvalRun[] };
  const match = runs.find((r) => {
    const d = r.details as { goldenSetHash?: string; gate?: { pass: boolean } } | null;
    return d?.goldenSetHash === hash && d.gate?.pass !== false && r.metrics["hybrid.recall@5"] !== undefined;
  });
  if (!match) return null;
  return {
    recall: match.metrics["hybrid.recall@5"]!,
    catalogSize: (match.details as { catalogSize?: number } | null)?.catalogSize,
  };
}

/** Titles the api serves - recorded per run, so a drop can be read against catalog growth. */
async function catalogSize(): Promise<number | undefined> {
  const res = await fetch(`${API_URL}/titles`);
  if (!res.ok) return undefined;
  return ((await res.json()) as { count?: number }).count;
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
  const baseline = hybrid && GATE ? await lastComparableRun(hash) : null;
  const gate = hybrid && GATE ? checkGate(hybrid.scores["recall@5"], baseline?.recall ?? null, MAX_DROP, REBASELINE) : null;
  const catalog = await catalogSize();

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
        catalogSize: catalog,
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
      const verdict = gate.rebaseline ? "REBASELINED" : gate.pass ? "PASS" : "FAIL";
      console.log(
        `\ngate: ${verdict} - hybrid recall@5 ${fmt(gate.current)} vs baseline ${fmt(gate.baseline)} (${gate.delta! >= 0 ? "+" : ""}${fmt(gate.delta!)}, max drop ${MAX_DROP})`,
      );
      const grew = catalog !== undefined && baseline?.catalogSize !== undefined ? catalog - baseline.catalogSize : undefined;
      console.log(`catalog: ${catalog ?? "?"} titles (baseline run: ${baseline?.catalogSize ?? "not recorded"}${grew ? `, ${grew > 0 ? "+" : ""}${grew}` : ""})`);
      if (gate.rebaseline) console.log(`accepted as the new baseline: ${gate.rebaseline.reason}`);
      if (!gate.pass) {
        console.log(
          "If no ranking code changed, new titles likely pushed expected answers down: check the misses above, " +
            'then re-run from Actions with "rebaseline" and a reason to accept it.',
        );
        process.exitCode = 1;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
