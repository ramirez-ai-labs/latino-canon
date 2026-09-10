import type { Env } from "../bindings.js";

export interface OmdbRatings {
  imdbRating: number | null;
  imdbVotes: number | null;
  metascore: number | null;
  awards: string | null; // free text, e.g. "Won 1 Oscar. 5 wins & 3 nominations." — parsed for `breakthrough` signal
}

/** OMDb supplements TMDB with ratings + an awards string useful for the `breakthrough` tag. */
export async function fetchOmdbRatings(env: Env, imdbId: string | null): Promise<OmdbRatings | null> {
  if (!imdbId) return null;
  const r = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${env.OMDB_API_KEY}`);
  if (!r.ok) throw new Error(`OMDb ${r.status}`);
  const _d = (await r.json()) as Record<string, string>;
  // TODO: map _d → OmdbRatings (numbers arrive as strings; "N/A" → null)
  throw new Error("fetchOmdbRatings: not implemented");
}
