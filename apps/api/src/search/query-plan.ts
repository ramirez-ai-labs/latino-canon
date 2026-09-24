import type { SearchFilters } from "@latino-canon/core";

/**
 * Words that say "a title" without saying anything about which one. Once the rewrite
 * moves "animation" into genre=Animation, "animation films" leaves just "films" as the
 * text to search - and nearly every title is a film, so that text ranks the catalog
 * essentially at random. Semantic search then post-filters genre over only its top-100
 * nearest neighbours of "films", which is how The Book of Life (Animation, in the index)
 * went missing from "animation films" while Coco and Vivo happened to survive. Accents
 * are stripped before matching, so "películas" hits "peliculas".
 */
const FILLER_WORDS = new Set([
  // "a title", EN + ES
  "film", "films", "movie", "movies", "cinema", "cine", "pelicula", "peliculas", "peli", "pelis",
  "series", "serie", "show", "shows", "tv", "title", "titles", "program", "programs", "programa", "programas",
  // connectors the rewrite commonly leaves behind
  "a", "an", "the", "of", "and", "some", "any", "de", "del", "el", "la", "los", "las", "y", "unas", "unos",
]);

/** True when the text left after filter extraction names no title, person, or plot. */
export function isFillerQuery(query: string): boolean {
  const tokens = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return tokens.every((t) => FILLER_WORDS.has(t));
}

/**
 * Least trustworthy inference first. `country` is dropped first: the rewrite has
 * inferred MX from nothing but a Spanish-language phrase ("películas animadas"), and
 * this catalog's production country rarely matches its characters' heritage. `decade`
 * next: a decade in the phrase is often the story's setting, not its release (ROADMAP
 * #16, Zoot Suit). `genre` last - when someone types "animation", that's the ask.
 */
const RELAX_ORDER: (keyof SearchFilters)[] = [
  "country",
  "decade",
  "theme",
  "inclusionType",
  "contentAdvisory",
  "kind",
  "genre",
];

/**
 * The filter sets to retry, in order, when the full set matched nothing: each drops one
 * more *inferred* filter. Filters the caller chose explicitly (UI facets) are never
 * dropped - an explicit facet that matches nothing should return nothing. This replaces
 * dropping every inferred filter at once, which turned "películas animadas" (a bad
 * country=MX next to a good genre=Animation) into an unfiltered, mostly live-action list.
 */
export function relaxedFilterSets(filters: SearchFilters, explicit: SearchFilters): SearchFilters[] {
  const sets: SearchFilters[] = [];
  let current: SearchFilters = { ...filters };
  for (const key of RELAX_ORDER) {
    if (current[key] === undefined || key in explicit) continue;
    current = { ...current };
    delete current[key];
    sets.push(current);
  }
  return sets;
}

/** What a title carries, for checking it against inferred filters. */
export interface TitleFacets {
  kind: string;
  yearStart: number;
  countries: string[];
  genres: string[];
  contentAdvisory: string | null;
  /** "theme:slug" / "inclusion_type:slug", confidence-gated like the visibility gate. */
  tags: string[];
}

/** How many of the inferred filters a title satisfies. */
export function countFacetMatches(facets: TitleFacets, inferred: SearchFilters): number {
  let n = 0;
  if (inferred.kind && facets.kind === inferred.kind) n++;
  if (inferred.decade && Math.floor(facets.yearStart / 10) * 10 === inferred.decade) n++;
  if (inferred.country && facets.countries.includes(inferred.country)) n++;
  if (inferred.genre && facets.genres.includes(inferred.genre)) n++;
  if (inferred.contentAdvisory && facets.contentAdvisory === inferred.contentAdvisory) n++;
  if (inferred.theme && facets.tags.includes(`theme:${inferred.theme}`)) n++;
  if (inferred.inclusionType && facets.tags.includes(`inclusion_type:${inferred.inclusionType}`)) n++;
  return n;
}

/**
 * Per matched inferred filter, in reciprocal-rank units (1/(60+rank)): 0.002 is worth
 * roughly 8 rank positions near the top of the list. Enough to lift a title that matches
 * what the rewrite understood above one that doesn't, not enough for a pile of wrong
 * guesses (the rewrite often emits 4-5 filters) to bury the text's best match.
 */
export const BOOST_PER_MATCH = 0.002;

/**
 * Re-rank retrieval hits so inferred filters count as evidence rather than requirements.
 * Uses rank, not the retriever's raw score, so the same boost means the same thing for
 * BM25, cosine, and RRF-fused lists alike.
 */
export function rerankWithBoosts<T extends { titleId: string }>(
  hits: T[],
  matchesFor: (titleId: string) => number,
): (T & { score: number })[] {
  return hits
    .map((h, rank) => ({ ...h, score: 1 / (60 + rank + 1) + BOOST_PER_MATCH * matchesFor(h.titleId) }))
    .sort((a, b) => b.score - a.score);
}
