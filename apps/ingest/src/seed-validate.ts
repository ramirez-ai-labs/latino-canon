import { INCLUSION_TYPES } from "@latino-canon/core";
import { diffNewTitles, type SeedRemoval, type SeedTitle } from "./seed-diff.js";

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
 * - An entry can't silently disappear. Phase 1's PRs each appended to the end of the
 *   file from the same base, and each merge replaced the previous PR's entries instead
 *   of keeping them: #227 dropped #226's three Brazil titles, #229 dropped #227's four
 *   Mexico titles. Four of them were already live, so they left the list of record
 *   without anyone noticing; three never ingested and were simply lost. A removal must
 *   now be listed in the file's `removed` ledger with a reason, which puts it in the
 *   reviewed diff.
 */
export function validateSeed(before: SeedTitle[], after: SeedTitle[], removed: SeedRemoval[] = []): string[] {
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

  const afterRefs = new Set(after.map((t) => t.ref));
  const ledger = new Map(removed.map((r) => [r.ref, r.reason]));
  for (const t of before) {
    if (afterRefs.has(t.ref)) continue;
    if (!ledger.has(t.ref)) {
      errors.push(
        `"${t.ref}" was removed from titles - if that's intended, add { "ref": "${t.ref}", "reason": "..." } to "removed"; if not, a merge dropped it (restore it)`,
      );
    }
  }
  for (const [ref, reason] of ledger) {
    if (typeof reason !== "string" || !reason.trim()) errors.push(`removed "${ref}": a reason is required`);
    if (afterRefs.has(ref)) errors.push(`"${ref}" is in both titles and removed - drop it from removed when re-adding`);
  }

  for (const t of diffNewTitles(before, after)) {
    if (t.tmdbId === undefined) {
      errors.push(
        `new entry "${t.ref}" must pin tmdbId - find the film on themoviedb.org and confirm its year and director match`,
      );
    }
  }

  return errors;
}
