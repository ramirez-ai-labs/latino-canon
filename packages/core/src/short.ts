import type { TitleKind } from "./types.js";

/**
 * A short is a film of 40 minutes or less, the Academy's definition for its short-film
 * awards. The 2026 SF Latino Film Festival batch (#337) brought the canon's first shorts
 * (8-23 min); without a label, a 14-minute short and a feature look the same in results.
 *
 * Derived from TMDB's runtime, not seeded, so every short is labeled on ingest with no
 * editor step. A missing or zero runtime (TMDB hasn't recorded one) is not a short:
 * labeling on a guess is worse than no label. Series and specials never are.
 */
export const SHORT_FILM_MAX_MINUTES = 40;

export function isShortFilm(title: { kind: TitleKind; runtime: number | null }): boolean {
  return title.kind === "film" && title.runtime !== null && title.runtime > 0 && title.runtime <= SHORT_FILM_MAX_MINUTES;
}
