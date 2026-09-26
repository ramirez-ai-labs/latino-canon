import type { Credit, CreditRole, Title } from "@latino-canon/core";
import type { IngestParams } from "./bindings.js";
import type { TmdbDetails, TmdbPerson } from "./sources/tmdb.js";
import type { OmdbRatings } from "./sources/omdb.js";

/** Vectorize rejects vector ids over 64 bytes, and a title's id is its vector id. */
export const MAX_ID_BYTES = 64;

/**
 * Deterministic slug id, e.g. "real-women-have-curves-2002". Stable across re-ingests.
 * ASCII only (accents are stripped), so characters = bytes. A slug that would pass
 * MAX_ID_BYTES is cut at the last word boundary that fits - found when "The Bronze
 * Screen: 100 Years of the Latino Image in American Cinema" (71 bytes) persisted fine and
 * then failed at embed with VECTOR_UPSERT_ERROR 40008. Every id shorter than the cap is
 * unchanged, so no existing title moves.
 */
export function slugId(title: string, year: number): string {
  let base = title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const room = MAX_ID_BYTES - `-${year}`.length;
  if (base.length > room) {
    const full = base;
    base = full.slice(0, room);
    // Keep the last word if the cap falls right after it; otherwise drop the partial word.
    const cut = base.lastIndexOf("-");
    if (full[room] !== "-" && cut > 0) base = base.slice(0, cut);
  }
  return `${base}-${year}`;
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
  void ratings; // not stored on the Title - the awards line reaches the blurb as a source instead (ai.ts blurbSources)

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
    representationHandling: null,
    contextNotes: [],
    oscarWin: null,
    genres: details.genres,
    // Classified separately from the main ingest pipeline (see ai.ts's
    // classifyContentAdvisory) - null here means "not yet classified", not "general".
    contentAdvisory: null,
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
      person: { id: `p${person.id}`, tmdbId: person.id, name: person.name, knownForDepartment: null, gender: person.gender },
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
