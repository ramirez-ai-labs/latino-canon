import type { EvalRun } from "@latino-canon/core";

/**
 * What the Eval page says, computed from the stored runs. Kept apart from the page so the
 * page is layout only - and so the one judgment call here (grouping the judge's
 * unsupported claims into patterns) sits in one reviewable place.
 */

export interface RetrievalDetails {
  goldenSetHash?: string;
  catalogSize?: number;
  gate?: { pass: boolean; baseline: number | null; current: number; delta: number | null } | null;
  misses?: { id: string; category: string; got: string[] }[];
}

export interface GroundednessDetails {
  worst?: { titleId: string; score: number; unsupported: string[] }[];
  failures?: { titleId: string; error: string }[];
}

/** eval-retrieval.yml fails a run whose hybrid recall@5 drops more than this below the last passing run. */
export const GATE_MAX_DROP = 0.03;

export type GateStatus = "pass" | "fail" | "none";

export interface TrendPoint {
  id: number;
  runAt: string;
  recall5: number;
  gate: GateStatus;
  /** Change against the last passing run, as the gate measured it. */
  gateDelta: number | null;
  /** Which golden set the run used - scores only compare within one (the gate's own rule). */
  goldenSetHash: string | null;
}

export const goldenSetHash = (r: EvalRun): string | null => (r.details as RetrievalDetails | null)?.goldenSetHash ?? null;

export const recall5 = (r: EvalRun): number | null => r.metrics["hybrid.recall@5"] ?? r.meanScore;

export function gateOf(r: EvalRun): { status: GateStatus; delta: number | null } {
  const gate = (r.details as RetrievalDetails | null)?.gate;
  if (!gate || gate.baseline == null) return { status: "none", delta: null };
  return { status: gate.pass ? "pass" : "fail", delta: gate.delta };
}

/** Retrieval runs oldest first, for the trend chart. */
export function trendPoints(runs: EvalRun[]): TrendPoint[] {
  return runs
    .filter((r) => r.evalType === "retrieval" && recall5(r) != null)
    .map((r) => {
      const g = gateOf(r);
      return { id: r.id, runAt: r.runAt, recall5: recall5(r)!, gate: g.status, gateDelta: g.delta, goldenSetHash: goldenSetHash(r) };
    })
    .sort((a, b) => a.runAt.localeCompare(b.runAt));
}

export interface CategoryScore {
  category: string;
  recall5: number;
  mrr: number | null;
}

/** Per-query-type scores from one retrieval run, weakest first - the weak spots lead. */
export function categoryScores(r: EvalRun): CategoryScore[] {
  const prefix = "hybrid.recall@5.";
  return Object.entries(r.metrics)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => {
      const category = k.slice(prefix.length);
      return { category, recall5: v, mrr: r.metrics[`hybrid.mrr.${category}`] ?? null };
    })
    .sort((a, b) => a.recall5 - b.recall5);
}

export interface FailurePattern {
  key: string;
  label: string;
  /** What's being done about it, in a sentence. */
  response: string;
  count: number;
  example: string | null;
}

/**
 * The judge's unsupported claims, grouped by what went wrong. Each failing blurb counts
 * once, under the first pattern any of its unsupported claims matches, in this order. The
 * first is the finding the page exists to show: on the 2026-09-27 run, 114 of 131 failing
 * blurbs failed on a significance sentence ("It matters as...") that the old blurb
 * prompt asked for and no source states.
 */
interface PatternRule {
  key: string;
  label: string;
  response: string;
  test: RegExp;
}

const PATTERNS: PatternRule[] = [
  {
    key: "significance",
    label: "A significance claim no source makes",
    response: "The blurb prompt no longer asks for one, and the ingest gate holds any blurb that still makes one.",
    test: /\bmatters?\b|\bpart of the latino film canon\b|\bis (?:significant|important)\b/i,
  },
  {
    key: "credit",
    label: "A credit the judge couldn't match",
    response: "Credit sources now name the work (\"Heli (2013) is directed by…\"), so the judge can match them.",
    test: /\b(?:directed|written|created) by\b/i,
  },
  {
    key: "interpretation",
    label: "An interpretation beyond the synopsis",
    response: "Held for an editor: \"It explores…\" can be fair reading, but no source states it.",
    test: /\b(?:explores?|critiques?|depicts?|reimagines?|portrays?|showcases?|highlights?|celebrates?)\b/i,
  },
  {
    key: "detail",
    label: "A detail the sources don't state",
    response: "Held for an editor. The OMDb awards line now gives blurbs more to draw on.",
    test: /./,
  },
];

export function failurePatterns(worst: NonNullable<GroundednessDetails["worst"]>): FailurePattern[] {
  const counts = PATTERNS.map((p) => ({ key: p.key, label: p.label, response: p.response, count: 0, example: null as string | null }));
  for (const w of worst) {
    const i = PATTERNS.findIndex((p) => w.unsupported.some((u) => p.test.test(u)));
    if (i === -1) continue;
    const bucket = counts[i]!;
    bucket.count++;
    bucket.example ??= w.unsupported.find((u) => PATTERNS[i]!.test.test(u)) ?? null;
  }
  return counts.filter((c) => c.count > 0);
}

/** The judge's own failure, in words a reader can use - not a JSON parser's message. */
export function describeJudgeFailure(error: string): string {
  if (/json/i.test(error)) return "The judge's reply wasn't valid JSON, so the blurb went unscored rather than failed.";
  return "The judge call failed, so the blurb went unscored rather than failed.";
}
