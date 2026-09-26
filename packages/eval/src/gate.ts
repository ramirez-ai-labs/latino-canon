import { createHash } from "node:crypto";
import { aggregate, type AggregateScores } from "./metrics.js";

export interface GoldQuery {
  id: string;
  query: string;
  category: string;
  relevant: string[];
  note?: string;
}

export interface PerQuery {
  id: string;
  category: string;
  ranked: string[];
  relevant: string[];
}

/** Scores per golden-query category, so an overall average can't hide one category breaking. */
export function byCategory(perQuery: PerQuery[]): Record<string, AggregateScores> {
  const groups = new Map<string, PerQuery[]>();
  for (const q of perQuery) groups.set(q.category, [...(groups.get(q.category) ?? []), q]);
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([c, qs]) => [c, aggregate(qs)]));
}

/**
 * Identifies the golden set a run was scored on. Adding or editing a query changes it,
 * and runs are only compared against a baseline with the same hash - otherwise growing
 * the set (new, harder queries) would read as a regression.
 */
export function goldenSetHash(queries: GoldQuery[]): string {
  const canonical = queries.map((q) => [q.id, q.query, [...q.relevant].sort()]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 12);
}

export interface GateResult {
  pass: boolean;
  /** null when there's no comparable baseline yet - this run becomes it. */
  baseline: number | null;
  current: number;
  delta: number | null;
  /** Set when a person accepted this run as the new baseline - see checkGate. */
  rebaseline?: { reason: string };
}

/**
 * Fail when hybrid recall@5 drops by more than `maxDrop` against the last comparable run.
 *
 * `rebaseline` records the run as passing whatever the drop, so it becomes the baseline.
 * Needed because the catalog grows every day (the ingest queue): new titles legitimately
 * push some expected answers down, and a failed run never becomes a baseline, so without
 * this the gate stays red forever after the first content-driven drop (it did, 2026-09-25:
 * 0.786 -> 0.753 with no ranking change). It takes a reason, recorded with the run, so
 * accepting a drop is a visible decision, not a silent one.
 */
export function checkGate(
  current: number,
  baseline: number | null,
  maxDrop: number,
  rebaseline?: { reason: string },
): GateResult {
  const delta = baseline === null ? null : current - baseline;
  if (rebaseline) {
    if (!rebaseline.reason.trim()) throw new Error("rebaseline needs a reason");
    return { pass: true, baseline, current, delta, rebaseline };
  }
  if (baseline === null) return { pass: true, baseline, current, delta: null };
  return { pass: delta! >= -maxDrop, baseline, current, delta };
}
