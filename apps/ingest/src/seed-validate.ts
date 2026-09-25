import { INCLUSION_TYPES } from "@latino-canon/core";
import { diffNewTitles, type SeedTitle } from "./seed-diff.js";

const KINDS = ["film", "series", "special"];

/** TMDB ids are per media type - a movie and a TV show can share one. Specials are movies. */
const tmdbKey = (t: SeedTitle): string => `${t.kind === "series" ? "tv" : "movie"}:${t.tmdbId}`;

/** "Y Tu Mamá También" and "Y Tu Mama Tambien" are the same title. */
const normalizeTitle = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Problems with a canon.seed.json change, as messages (empty = valid). Run on every PR by
 * validate-pr.yml (scripts/validate-seed.ts), before a bad entry can reach the ingest
 * Workflow - every rule here is one a merged seed PR has already broken:
 *
 * - Duplicates (#234: The Maid (2009) twice). `/seed-load` skipped the second copy by
 *   slug, but a duplicate with different fields is a silent disagreement.
 * - New entries must pin `tmdbId`. Unpinned entries resolve through TMDB title search,
 *   which needs an exact title match: Spanish/Portuguese seed titles against TMDB's
 *   English ones never matched (5 of Phase 1's 15 never ingested), and an exact match on
 *   a different film was accepted (Los olvidados became a 2014 film). Existing unpinned
 *   entries are grandfathered - they're already ingested.
 */
export function validateSeed(before: SeedTitle[], after: SeedTitle[]): string[] {
  const errors: string[] = [];

  after.forEach((t, i) => {
    const at = `titles[${i}] ${t.ref ?? "(no ref)"}`;
    if (typeof t.ref !== "string" || !t.ref.trim()) errors.push(`${at}: missing ref`);
    if (typeof t.title !== "string" || !t.title.trim()) errors.push(`${at}: missing title`);
    if (!Number.isInteger(t.year) || t.year < 1890 || t.year > 2100) errors.push(`${at}: year must be an integer 1890-2100`);
    if (!KINDS.includes(t.kind)) errors.push(`${at}: kind must be one of ${KINDS.join(", ")}`);
    if (t.tmdbId !== undefined && (!Number.isInteger(t.tmdbId) || t.tmdbId <= 0)) {
      errors.push(`${at}: tmdbId must be a positive integer`);
    }
    const types = t.seedInclusionTypes ?? [];
    if (types.length === 0) errors.push(`${at}: seedInclusionTypes must list at least one type (see CRITERIA.md)`);
    for (const type of types) {
      if (!(INCLUSION_TYPES as readonly string[]).includes(type)) {
        errors.push(`${at}: unknown inclusion type "${type}" (valid: ${INCLUSION_TYPES.join(", ")})`);
      }
    }
  });

  const dupes = (label: string, key: (t: SeedTitle) => string | null) => {
    const seen = new Map<string, string>();
    for (const t of after) {
      const k = key(t);
      if (k === null) continue;
      const first = seen.get(k);
      if (first !== undefined) errors.push(`duplicate ${label}: "${t.ref}" repeats "${first}"`);
      else seen.set(k, t.ref);
    }
  };
  dupes("ref", (t) => t.ref);
  dupes("tmdbId", (t) => (t.tmdbId === undefined ? null : tmdbKey(t)));
  dupes("title + year", (t) => `${normalizeTitle(t.title ?? "")}:${t.year}`);

  for (const t of diffNewTitles(before, after)) {
    if (t.tmdbId === undefined) {
      errors.push(
        `new entry "${t.ref}" must pin tmdbId - find the film on themoviedb.org and confirm its year and director match`,
      );
    }
  }

  return errors;
}
