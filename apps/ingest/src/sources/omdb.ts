import type { Env } from "../bindings.js";

export interface OmdbRatings {
  imdbRating: number | null;
  imdbVotes: number | null;
  metascore: number | null;
  awards: string | null; // free text, e.g. "Won 1 Oscar. 5 wins & 3 nominations." — parsed for `breakthrough` signal
}

interface OmdbRaw {
  Response: "True" | "False";
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Awards?: string;
}

/** OMDb supplements TMDB with ratings + an awards string useful for the `breakthrough` tag. */
export async function fetchOmdbRatings(env: Env, imdbId: string | null): Promise<OmdbRatings | null> {
  if (!imdbId) return null;
  const r = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${env.OMDB_API_KEY}`);
  if (!r.ok) throw new Error(`OMDb ${r.status}`);
  const d = (await r.json()) as OmdbRaw;
  if (d.Response === "False") return null;

  return {
    imdbRating: parseOmdbNumber(d.imdbRating),
    imdbVotes: parseOmdbNumber(d.imdbVotes?.replace(/,/g, "")),
    metascore: parseOmdbNumber(d.Metascore),
    awards: d.Awards && d.Awards !== "N/A" ? d.Awards : null,
  };
}

/** OMDb encodes "unknown" as the literal string "N/A" instead of omitting the field. */
function parseOmdbNumber(value: string | undefined): number | null {
  if (!value || value === "N/A") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
