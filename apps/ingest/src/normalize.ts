import type { Credit, CreditRole, Title } from "@latino-canon/core";
import type { IngestParams } from "./bindings.js";
import type { TmdbDetails, TmdbPerson } from "./sources/tmdb.js";
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
  void ratings; // not yet folded into the Title shape — see apps/ingest/src/ai.ts blurbForIngest TODO

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
    credits: toCredits(details.credits),
    tags: [],
    blurb: null,
  };
}

function toCredits(credits: TmdbDetails["credits"]): Credit[] {
  // Same person can show up under more than one crew role (e.g. writer + director) — that's
  // legitimate and kept; a person listed twice *within* one role (co-writing credits, TMDB
  // data quirks) is deduped below since it would otherwise violate the credits PK.
  const seen = new Set<string>();
  const out: Credit[] = [];

  const push = (person: TmdbPerson, role: CreditRole, order: number, character: string | null) => {
    const key = `${role}:${person.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      person: { id: `p${person.id}`, tmdbId: person.id, name: person.name, knownForDepartment: null },
      role,
      character,
      order,
    });
  };

  credits.directors.forEach((p, i) => push(p, "director", i, null));
  credits.writers.forEach((p, i) => push(p, "writer", i, null));
  credits.creators.forEach((p, i) => push(p, "creator", i, null));
  credits.cast.forEach((p) => push(p, "cast", p.order, p.character || null));

  return out;
}
