import type { SeedTitle } from "../scripts/lib/post-titles.js";

export type { SeedTitle };

/** Parse a canon.seed.json payload; malformed/missing input just yields no titles. */
export function parseSeedFile(raw: string): SeedTitle[] {
  try {
    const parsed = JSON.parse(raw) as { titles?: SeedTitle[] };
    return parsed.titles ?? [];
  } catch {
    return [];
  }
}

/** An entry deliberately taken out of the canon - see validateSeed's removal rule. */
export interface SeedRemoval {
  ref: string;
  reason: string;
}

/** The `removed` ledger of a canon.seed.json payload; malformed/missing input yields none. */
export function parseSeedRemovals(raw: string): SeedRemoval[] {
  try {
    const parsed = JSON.parse(raw) as { removed?: SeedRemoval[] };
    return parsed.removed ?? [];
  } catch {
    return [];
  }
}

/**
 * Titles present in `after` but not in `before`, keyed by `ref` ("Title (Year)").
 * Used by .github/workflows/ingest-new-titles.yml to turn "add a title to
 * canon.seed.json" into an automatic ingest trigger, instead of a manual curl/CLI step.
 */
export function diffNewTitles(before: SeedTitle[], after: SeedTitle[]): SeedTitle[] {
  const existing = new Set(before.map((t) => t.ref));
  return after.filter((t) => !existing.has(t.ref));
}
