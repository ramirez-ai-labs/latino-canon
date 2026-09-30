/**
 * Curation eval (scoring in curation.ts): sends each golden request to the deployed api's
 * POST /agents/curate and checks every pick against the request's hard constraints from
 * catalog metadata.
 *
 *   pnpm --filter @latino-canon/eval curation
 *
 * API_URL points at another api - a non-live version with CURATE_AGENT=v2, say (the way
 * ranking changes are measured before merge). CASES=id1,id2 runs a subset.
 *
 * Cost: v1 spends two 8B calls a request at most, a few neurons for the run. A v2 target
 * spends ~180 70B neurons a request (design estimate), so a v2 run is the day's optional
 * 70B job - eval-curation.yml claims the slot for it.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CurationResponse, Title } from "@latino-canon/core";
import { writeEvalRunSql } from "./record-run.js";
import { scoreCase, summarize, type CaseResult, type CurationCase, type PickFacts } from "./curation.js";

const API_URL = process.env.API_URL ?? "https://latino-canon-api.ai-builders-studio-latinx.workers.dev";
const PICKS = 5;

function loadCases(): { cases: CurationCase[]; hash: string } {
  const raw = readFileSync(fileURLToPath(new URL("./datasets/curation.jsonl", import.meta.url)), "utf8");
  const all = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CurationCase);
  const only = process.env.CASES?.trim() ? process.env.CASES.split(",").map((s) => s.trim()) : undefined;
  return {
    cases: only ? all.filter((c) => only.includes(c.id)) : all,
    hash: createHash("sha256").update(raw).digest("hex").slice(0, 12),
  };
}

/** v2 adds `agentVersion` (design doc, "API compatibility"); a response without it is v1's. */
type Response = CurationResponse & { agentVersion?: string; fallbackReason?: string };

async function curate(query: string): Promise<Response> {
  const r = await fetch(`${API_URL}/agents/curate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, limit: PICKS }),
  });
  if (!r.ok) throw new Error(`curate ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Response;
}

/** Production countries aren't on the card; the title record has them. No AI call. */
async function countries(id: string): Promise<string[] | null> {
  const r = await fetch(`${API_URL}/titles/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  return ((await r.json()) as Title).country ?? null;
}

/** Report lines go to stdout: this is a CLI, and its output is the report. */
const log = (line: string) => process.stdout.write(`${line}\n`);
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(0)}%`);

async function main() {
  const { cases, hash } = loadCases();
  log(`${cases.length} cases (set ${hash}) against ${API_URL}\n`);

  const results: CaseResult[] = [];
  const failures: { id: string; error: string }[] = [];
  const versions = new Set<string>();
  const fallbacks: { id: string; reason: string }[] = [];
  let cachedResponses = 0;
  const ms: number[] = [];

  for (const c of cases) {
    try {
      const started = Date.now();
      const res = await curate(c.request);
      ms.push(Date.now() - started);
      if (res.cached) cachedResponses++;
      versions.add(res.agentVersion ?? "v1");
      if (res.fallbackReason) fallbacks.push({ id: c.id, reason: res.fallbackReason });

      const needCountries = c.constraints.country !== undefined;
      const picks: PickFacts[] = await Promise.all(
        res.topResults.slice(0, PICKS).map(async ({ title: t }) => ({
          id: t.id,
          kind: t.kind,
          yearStart: t.yearStart,
          directorGender: t.directorGender,
          genres: t.genres,
          contentAdvisory: t.contentAdvisory,
          themes: t.themes,
          countries: needCountries ? await countries(t.id) : null,
        })),
      );
      const r = scoreCase(c, picks);
      results.push(r);
      const misses = r.picks
        .filter((p) => !p.meetsAll)
        .map((p) => `${p.id} (${Object.entries(p.verdicts).filter(([, v]) => v !== "met").map(([k, v]) => `${k} ${v}`).join(", ")})`);
      log(`${pct(r.precision).padStart(4)} ${c.id.padEnd(26)} ${r.picks.length} picks${misses.length ? `  - ${misses.join("; ")}` : ""}`);
    } catch (e) {
      // One failed request shouldn't discard the rest of the run; it's reported, not scored.
      failures.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
      log(`   ! ${c.id.padEnd(26)} ${failures.at(-1)!.error.slice(0, 120)}`);
    }
  }

  const s = summarize(results);
  const agent = [...versions].sort().join("+") || "unknown";
  const sorted = [...ms].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]! : null;
  log(`\nprecision@${PICKS} ${pct(s.precision)} (${s.picks} picks)  per case ${pct(s.casePrecision)}  agent ${agent}  failed=${failures.length}`);
  for (const [k, v] of Object.entries(s.byConstraint)) log(`  ${k.padEnd(16)} ${pct(v.rate)} of ${v.checked}${v.unknown ? ` (${v.unknown} unknown)` : ""}`);
  log(`cached responses ${cachedResponses}/${results.length}; p95 ${p95 ?? "—"} ms`);

  mkdirSync(".eval-out", { recursive: true });
  writeFileSync(`.eval-out/curation-${Date.now()}.json`, JSON.stringify({ API_URL, hash, agent, summary: s, results, failures }, null, 2));
  // Nothing scored (api down, rate limited) is an outage, not a 0% score: fail the job and
  // write no row, so the Eval page never shows it as a result.
  if (results.length === 0) throw new Error(`no case was scored; ${failures.length} requests failed`);
  writeEvalRunSql(".eval-out/insert.sql", {
    evalType: "curation",
    runAt: new Date().toISOString(),
    n: results.length,
    failed: failures.length,
    meanScore: s.precision,
    metrics: {
      precision: s.precision,
      casePrecision: s.casePrecision,
      picks: s.picks,
      empty: s.empty,
      cachedResponses,
      ...(p95 !== null ? { p95Ms: p95 } : {}),
      ...Object.fromEntries(Object.entries(s.byConstraint).map(([k, v]) => [`constraint.${k}`, v.rate])),
    },
    details: {
      agent,
      apiUrl: API_URL,
      caseSetHash: hash,
      byConstraint: s.byConstraint,
      fallbacks,
      cases: results.map((r) => ({
        id: r.id,
        precision: r.precision,
        misses: r.picks.filter((p) => !p.meetsAll).map((p) => ({ id: p.id, verdicts: p.verdicts })),
      })),
      failures,
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
