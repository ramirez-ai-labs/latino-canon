import type { PersonGender } from "@latino-canon/core";
import type { Env } from "../bindings.js";

const BASE = "https://api.themoviedb.org/3";

export interface TmdbPerson {
  id: number;
  name: string;
  gender: PersonGender | null;
}

export interface TmdbCastMember extends TmdbPerson {
  character: string;
  order: number;
}

export interface TmdbDetails {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  releaseYear: number;
  lastYear: number | null;
  countries: string[]; // ISO 3166-1 alpha-2
  languages: string[]; // ISO 639-1
  runtime: number | null;
  popularity: number;
  adult: boolean; // TMDB adult content flag - exclude if true
  genres: string[]; // TMDB genre names, e.g. "Animation" - always present on this endpoint
  credits: {
    directors: TmdbPerson[];
    writers: TmdbPerson[];
    creators: TmdbPerson[];
    cast: TmdbCastMember[];
  };
}

interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
}

/** Search TMDB and return the best-matching id for (title, year, kind). */
export async function resolveTmdbId(
  env: Env,
  title: string,
  year: number,
  kind: "film" | "series" | "special",
): Promise<number> {
  // TMDB catalogs stand-up specials as movies, same surface as film - confirmed by
  // querying TMDB directly (a special has no separate TMDB media type of its own).
  const path = kind === "series" ? "search/tv" : "search/movie";
  // Deliberately no &year= param: TMDB's server-side year filter excludes any
  // candidate with an empty release_date, even an exact-title match - found via
  // "20 Pounds to Happiness" resolving with a plain title search but returning zero
  // results once &year=2025 was added, despite existing on TMDB (just undated).
  // scoreCandidate below already does year-proximity disambiguation client-side, so
  // the server-side filter was redundant for correct matches and actively harmful
  // for undated ones.
  const url = `${BASE}/${path}?query=${encodeURIComponent(title)}&api_key=${env.TMDB_API_KEY}`;
  const res = await fetchJson<{ results: TmdbSearchResult[] }>(url);
  if (res.results.length === 0) throw new Error(`TMDB: no match for "${title}" (${year})`);

  const best = res.results.reduce((a, b) => (scoreCandidate(title, year, b) > scoreCandidate(title, year, a) ? b : a));
  // Real incident: seed title "No" (2012, dir. Pablo Larraín) is too short/common a
  // query for TMDB's search to return it at all - every candidate scored a 0 title
  // match, so the reduce above fell back to pure year-proximity and confidently picked
  // "No Strings Attached" (2011, year penalty 1) instead. That got persisted,
  // classified, and blurbed as a Latino-canon title before anyone noticed - a title
  // this ambiguous needs a pinned tmdbId in the seed entry, not a guess this function
  // has no real basis for making.
  if (!isExactTitleMatch(title, best)) {
    throw new Error(
      `TMDB: no exact title match for "${title}" (${year}) among ${res.results.length} results - pin tmdbId in canon.seed.json`,
    );
  }
  return best.id;
}

function isExactTitleMatch(title: string, c: TmdbSearchResult): boolean {
  const candidateTitle = c.title ?? c.name ?? "";
  return candidateTitle.toLowerCase() === title.toLowerCase();
}

/** Higher is better: exact title match dominates; closer release year breaks ties. */
function scoreCandidate(title: string, year: number, c: TmdbSearchResult): number {
  const titleMatch = isExactTitleMatch(title, c) ? 100 : 0;
  const dateStr = c.release_date || c.first_air_date || "";
  const candidateYear = dateStr ? Number(dateStr.slice(0, 4)) : NaN;
  const yearPenalty = Number.isNaN(candidateYear) ? 10 : Math.abs(candidateYear - year);
  return titleMatch - yearPenalty;
}

interface TmdbCrewMember {
  id: number;
  name: string;
  gender?: number;
  job?: string;
  department?: string;
}
interface TmdbCastRaw {
  id: number;
  name: string;
  gender?: number;
  character?: string;
  order?: number;
}
interface TmdbCreditsRaw {
  cast?: TmdbCastRaw[];
  crew?: TmdbCrewMember[];
}
interface TmdbCreatedByRaw {
  id: number;
  name: string;
  gender?: number;
}
interface TmdbCountryRaw {
  iso_3166_1: string;
}
interface TmdbLanguageRaw {
  iso_639_1: string;
}
interface TmdbGenreRaw {
  id: number;
  name: string;
}
interface TmdbRaw {
  id: number;
  imdb_id?: string | null;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  popularity?: number;
  adult?: boolean; // TMDB adult content flag
  production_countries?: TmdbCountryRaw[];
  origin_country?: string[];
  spoken_languages?: TmdbLanguageRaw[];
  credits?: TmdbCreditsRaw;
  created_by?: TmdbCreatedByRaw[];
  external_ids?: { imdb_id?: string | null };
  // Present on every /movie/{id} and /tv/{id} detail response (distinct from the
  // genre_ids-only shape on search/list endpoints) - no extra API call needed.
  genres?: TmdbGenreRaw[];
}

/** Full details + credits for a resolved id. */
export async function fetchTmdbDetails(env: Env, id: number, kind: "film" | "series" | "special"): Promise<TmdbDetails> {
  const path = kind === "series" ? "tv" : "movie";
  const url = `${BASE}/${path}/${id}?append_to_response=credits,external_ids&api_key=${env.TMDB_API_KEY}`;
  const raw = await fetchJson<TmdbRaw>(url);

  const releaseDate = raw.release_date || raw.first_air_date || "";
  const releaseYear = releaseDate ? Number(releaseDate.slice(0, 4)) : NaN;
  if (Number.isNaN(releaseYear)) throw new Error(`TMDB ${id}: no release/air date to derive a year from`);

  return {
    tmdbId: raw.id,
    imdbId: raw.imdb_id || raw.external_ids?.imdb_id || null,
    title: raw.title ?? raw.name ?? "",
    originalTitle: raw.original_title ?? raw.original_name ?? raw.title ?? raw.name ?? "",
    overview: raw.overview ?? "",
    posterPath: raw.poster_path ?? null,
    releaseYear,
    lastYear: raw.last_air_date ? Number(raw.last_air_date.slice(0, 4)) : null,
    countries: kind === "series"
      ? (raw.origin_country ?? [])
      : (raw.production_countries ?? []).map((c) => c.iso_3166_1),
    languages: (raw.spoken_languages ?? []).map((l) => l.iso_639_1),
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    popularity: raw.popularity ?? 0,
    adult: raw.adult ?? false, // TMDB adult content flag
    genres: (raw.genres ?? []).map((g) => g.name),
    credits: mapCredits(raw),
  };
}

function mapCredits(raw: TmdbRaw): TmdbDetails["credits"] {
  const crew = raw.credits?.crew ?? [];
  const cast = raw.credits?.cast ?? [];
  const toPerson = (p: { id: number; name: string; gender?: number }): TmdbPerson => ({
    id: p.id,
    name: p.name,
    gender: mapGender(p.gender),
  });

  return {
    directors: dedupeById(crew.filter((c) => c.job === "Director").map(toPerson)),
    writers: dedupeById(crew.filter((c) => c.department === "Writing").map(toPerson)),
    creators: dedupeById((raw.created_by ?? []).map(toPerson)),
    cast: cast
      .slice(0, 10)
      .map((c, i) => ({ id: c.id, name: c.name, gender: mapGender(c.gender), character: c.character ?? "", order: c.order ?? i })),
  };
}

/** TMDB's own gender enum: 0 = not specified, 1 = female, 2 = male, 3 = non-binary. */
export function mapGender(code: number | undefined): PersonGender | null {
  switch (code) {
    case 1: return "female";
    case 2: return "male";
    case 3: return "non_binary";
    default: return null;
  }
}

/** Backfill path for a person credited before this project captured gender at ingest time. */
export async function fetchTmdbPersonGender(env: Env, tmdbId: number): Promise<PersonGender | null> {
  const url = `${BASE}/person/${tmdbId}?api_key=${env.TMDB_API_KEY}`;
  const raw = await fetchJson<{ gender?: number }>(url);
  return mapGender(raw.gender);
}

function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Map<number, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()];
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`TMDB ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
