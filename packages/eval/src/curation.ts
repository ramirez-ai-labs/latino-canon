/**
 * Curation eval: do the curation agent's picks meet the hard constraints the request states?
 * Every check is a comparison with catalog metadata - director gender, kind, decade, country,
 * genre, content advisory, theme - so no LLM judge, and a score can't drift with a judge's
 * mood (the groundedness judge scored identical inputs 0.525 and 0.431 before it was pinned).
 * Tone ("uplifting", "gritty") can't be checked from metadata, so no request is scored on it.
 *
 * It's the ship gate for agentic curation v2 (docs/design/AGENTIC_CURATION_V2.md): v1 and v2
 * answer the same requests, and v2 becomes the default only if its constraint precision is
 * at least 0.80 and 0.20 above v1's.
 *
 * Pure scoring lives here (tested in curation.test.ts); run-curation.ts does the I/O.
 */
import type { TitleCard } from "@latino-canon/core";

/** A request's hard constraints, each checkable from a title's metadata. */
export interface CurationConstraints {
  directorGender?: "female" | "male";
  kind?: "film" | "series" | "special";
  /** Start year of a decade: 1960 means 1960-1969, by release year (year_start). */
  decade?: number;
  /** ISO 3166-1 alpha-2; met when it's among the title's production countries. */
  country?: string;
  genre?: string;
  /** "general" for a request aimed at children or the whole family. */
  contentAdvisory?: "general" | "mature";
  theme?: string;
}
export type ConstraintKey = keyof CurationConstraints;

/** A golden case (datasets/curation.jsonl). */
export interface CurationCase {
  id: string;
  request: string;
  constraints: CurationConstraints;
  /** Visible titles meeting every constraint when the case was written, from production D1 -
   * a case needs enough of them that a perfect agent can fill its picks. */
  available: number;
  note?: string;
}

/** What scoring reads from a pick: the card, plus countries (which the card doesn't carry). */
export type PickFacts = Pick<TitleCard, "id" | "kind" | "yearStart" | "directorGender" | "genres" | "contentAdvisory" | "themes"> & {
  countries: string[] | null;
};

export type Verdict = "met" | "failed" | "unknown";

/**
 * One constraint against one pick. "unknown" means the catalog has no value to check (43 of
 * 337 titles have no director gender on record, for instance). It counts as not met in the
 * headline: an agent that can't show a pick fits shouldn't get credit for it, and v1 and v2
 * face the same unknowns. It's reported separately so a low score from missing data is visible.
 */
export function checkConstraint(key: ConstraintKey, want: string | number, pick: PickFacts): Verdict {
  switch (key) {
    case "directorGender":
      return pick.directorGender === null ? "unknown" : pick.directorGender === want ? "met" : "failed";
    case "kind":
      return pick.kind === want ? "met" : "failed";
    case "decade":
      return pick.yearStart >= Number(want) && pick.yearStart < Number(want) + 10 ? "met" : "failed";
    case "country":
      return pick.countries === null ? "unknown" : pick.countries.includes(String(want)) ? "met" : "failed";
    case "genre":
      return pick.genres.length === 0 ? "unknown" : pick.genres.includes(String(want)) ? "met" : "failed";
    case "contentAdvisory":
      return pick.contentAdvisory === null ? "unknown" : pick.contentAdvisory === want ? "met" : "failed";
    case "theme":
      return (pick.themes as string[]).includes(String(want)) ? "met" : "failed";
  }
}

export interface PickResult {
  id: string;
  /** Every constraint met - the unit of the headline. */
  meetsAll: boolean;
  verdicts: Partial<Record<ConstraintKey, Verdict>>;
}

export interface CaseResult {
  id: string;
  picks: PickResult[];
  /** Share of this case's picks meeting every constraint; null when it returned none. */
  precision: number | null;
}

export function scoreCase(c: CurationCase, picks: PickFacts[]): CaseResult {
  const scored = picks.map((p): PickResult => {
    const verdicts: PickResult["verdicts"] = {};
    for (const [key, want] of Object.entries(c.constraints) as [ConstraintKey, string | number][]) {
      verdicts[key] = checkConstraint(key, want, p);
    }
    return { id: p.id, verdicts, meetsAll: Object.values(verdicts).every((v) => v === "met") };
  });
  return {
    id: c.id,
    picks: scored,
    precision: scored.length > 0 ? scored.filter((p) => p.meetsAll).length / scored.length : null,
  };
}

export interface CurationSummary {
  cases: number;
  picks: number;
  /** Picks meeting every constraint of their request, over all picks returned. The headline:
   * returning fewer picks isn't penalized, since the catalog can hold fewer than asked for. */
  precision: number;
  /** Mean of per-case precision, so one case with many picks can't dominate. */
  casePrecision: number;
  /** Per constraint type: share of the picks it applied to that met it. */
  byConstraint: Partial<Record<ConstraintKey, { checked: number; met: number; unknown: number; rate: number }>>;
  /** Cases that returned no picks. */
  empty: number;
}

export function summarize(results: CaseResult[]): CurationSummary {
  const allPicks = results.flatMap((r) => r.picks);
  const byConstraint: CurationSummary["byConstraint"] = {};
  for (const p of allPicks) {
    for (const [key, v] of Object.entries(p.verdicts) as [ConstraintKey, Verdict][]) {
      const s = (byConstraint[key] ??= { checked: 0, met: 0, unknown: 0, rate: 0 });
      s.checked++;
      if (v === "met") s.met++;
      if (v === "unknown") s.unknown++;
    }
  }
  for (const s of Object.values(byConstraint)) s.rate = s.checked > 0 ? s.met / s.checked : 0;
  const withPicks = results.filter((r) => r.precision !== null);
  return {
    cases: results.length,
    picks: allPicks.length,
    precision: allPicks.length > 0 ? allPicks.filter((p) => p.meetsAll).length / allPicks.length : 0,
    casePrecision: withPicks.length > 0 ? withPicks.reduce((s, r) => s + r.precision!, 0) / withPicks.length : 0,
    byConstraint,
    empty: results.length - withPicks.length,
  };
}
