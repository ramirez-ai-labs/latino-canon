import type { Title } from "@latino-canon/core";
import type { IngestParams } from "./bindings.js";
import type { TmdbDetails } from "./sources/tmdb.js";
import type { OmdbRatings } from "./sources/omdb.js";

/** Deterministic slug id, e.g. "real-women-have-curves-2002". Stable across re-ingests. */
export function slugId(title: string, year: number): string {
  return `${title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")}-${year}`;
}

/**
 * Map source payloads → the canonical `Title`. Tags and blurb are attached by later
 * workflow steps, so they come back empty here.
 */
export function normalizeTitle(
  params: IngestParams,
  details: TmdbDetails,
  ratings: OmdbRatings | null,
): Title {
  // TODO: real mapping. This is the shape the rest of the pipeline expects.
  return {
    id: slugId(details.title, details.releaseYear),
    tmdbId: details.tmdbId,
    imdbId: details.imdbId,
    kind: params.kind,
    title: details.title,
    originalTitle: details.originalTitle === details.title ? null : details.originalTitle,
    yearStart: details.releaseYear,
    yearEnd: params.kind === "series" ? details.lastYear : null,
    country: details.countries,
    language: details.languages,
    synopsis: details.overview || null,
    posterKey: null, // set by cachePoster step
    popularity: details.popularity,
    runtime: details.runtime,
    credits: [], // TODO: map details.credits → Credit[]
    tags: [],
    blurb: null,
  };
}
