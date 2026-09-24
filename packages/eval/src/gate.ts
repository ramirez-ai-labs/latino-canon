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
}

/** Fail when hybrid recall@5 drops by more than `maxDrop` against the last comparable run. */
export function checkGate(current: number, baseline: number | null, maxDrop: number): GateResult {
  if (baseline === null) return { pass: true, baseline, current, delta: null };
  const delta = current - baseline;
  return { pass: delta >= -maxDrop, baseline, current, delta };
}
