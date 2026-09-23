import type { PersonGender } from "./taxonomy.js";

/**
 * Regex-based, zero-AI-cost detectors for signals that only the curation agent's
 * `extractIntent` understands - the plain `/search` endpoint's `SearchFilters` has no
 * directorGender/leadGender/tone field, so a query naming one of these must route to
 * `/agents/curate` or the request is silently ignored (no error, just wrong results).
 *
 * Single source of truth for both sides of that routing decision: apps/api's
 * `extractIntent` (which needs these to actually build the intent) and apps/web's
 * `isComplexQuery` (which needs them to decide whether to call the agent at all) used
 * to keep independent copies of these regexes, and the web copy silently fell behind
 * when lead-gender support was added - "female lead" queries kept going to plain
 * search, which has no way to act on that ask, and ranked results with no regard for
 * lead gender. Import from here instead of redefining.
 */
export const DIRECTOR_GENDER_RE =
  /\b(directed|made|helmed)\b.{0,20}\b(women|female|woman)\b|\bwomen[- ]directed\b|\bfemale directors?\b/i;
export const DIRECTOR_GENDER_MALE_RE =
  /\b(directed|made|helmed)\b.{0,20}\b(men|male|man)\b|\bmen[- ]directed\b|\bmale directors?\b/i;
// Deliberately distinct wording from the director regexes above - "lead"/"protagonist"/
// "starring" all point at the cast, not who directed, so "female director" alone never
// matches this, and "female lead" alone never matches DIRECTOR_GENDER_RE. A query can
// (and the one that motivated this - "female director with a female lead" - does) name
// both independently. "lead actor(s)" is deliberately not the male counterpart of "lead
// actress" - unlike "actress", "lead actor" is commonly used gender-neutrally today, so
// treating it as a male signal would be a real, unforced bias, not a symmetry win.
export const LEAD_GENDER_RE = /\bfemale leads?\b|\blead actress(es)?\b|\bfemale protagonists?\b|\bstarring (a )?wom(a|e)n\b/i;
export const LEAD_GENDER_MALE_RE = /\bmale leads?\b|\bmale protagonists?\b|\bstarring (a )?m(a|e)n\b/i;
export const LIGHTER_RE = /\b(light(er)?|fun|funny|feel[- ]good|uplifting|comedic|comed(y|ies))\b/i;
export const HEAVIER_RE = /\b(heavy|heavier|dark|serious|intense|not too light)\b/i;

export function detectDirectorGender(query: string): PersonGender | undefined {
  return DIRECTOR_GENDER_RE.test(query) ? "female" : DIRECTOR_GENDER_MALE_RE.test(query) ? "male" : undefined;
}

export function detectLeadGender(query: string): PersonGender | undefined {
  return LEAD_GENDER_RE.test(query) ? "female" : LEAD_GENDER_MALE_RE.test(query) ? "male" : undefined;
}

export function detectTone(query: string): "lighter" | "heavier" | undefined {
  return LIGHTER_RE.test(query) ? "lighter" : HEAVIER_RE.test(query) ? "heavier" : undefined;
}

/** True when a query names a signal that only `/agents/curate` can act on. */
export function isComplexQuery(query: string): boolean {
  if (!query) return false;
  return detectDirectorGender(query) !== undefined || detectLeadGender(query) !== undefined || detectTone(query) !== undefined;
}
