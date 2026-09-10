import type { Env } from "../bindings.js";

const BASE = "https://api.themoviedb.org/3";

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
  credits: {
    directors: string[];
    writers: string[];
    creators: string[];
    cast: { name: string; character: string; order: number }[];
  };
}

/** Search TMDB and return the best-matching id for (title, year, kind). */
export async function resolveTmdbId(
  env: Env,
  title: string,
  year: number,
  kind: "film" | "series",
): Promise<number> {
  const path = kind === "film" ? "search/movie" : "search/tv";
  const url = `${BASE}/${path}?query=${encodeURIComponent(title)}&year=${year}&api_key=${env.TMDB_API_KEY}`;
  const res = await fetchJson<{ results: { id: number; release_date?: string; first_air_date?: string }[] }>(url);
  // TODO: score candidates by title similarity + year proximity instead of taking [0]
  const first = res.results[0];
  if (!first) throw new Error(`TMDB: no match for "${title}" (${year})`);
  return first.id;
}

/** Full details + credits for a resolved id. */
export async function fetchTmdbDetails(env: Env, id: number, kind: "film" | "series"): Promise<TmdbDetails> {
  const path = kind === "film" ? "movie" : "tv";
  const url = `${BASE}/${path}/${id}?append_to_response=credits,external_ids&api_key=${env.TMDB_API_KEY}`;
  const _raw = await fetchJson<Record<string, unknown>>(url);
  // TODO: map _raw → TmdbDetails (movie vs tv field differences: title/name,
  //       release_date/first_air_date, crew job === 'Director' | 'Writer', created_by[]).
  throw new Error("fetchTmdbDetails: not implemented");
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`TMDB ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
