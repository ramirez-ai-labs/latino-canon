import type { Env } from "./bindings.js";

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

/**
 * Copy the poster into R2 so the app serves it from our origin (no hot-linking, no
 * egress cost). Returns the R2 key, which goes into titles.poster_key.
 */
export async function cachePoster(env: Env, titleId: string, posterPath: string): Promise<void> {
  const key = `posters/${titleId}.jpg`;
  const existing = await env.POSTERS.head(key);
  if (existing) return;

  const res = await fetch(`${TMDB_IMG}${posterPath}`);
  if (!res.ok || !res.body) throw new Error(`poster fetch ${res.status}`);
  await env.POSTERS.put(key, res.body, { httpMetadata: { contentType: "image/jpeg" } });

  await env.DB.prepare("UPDATE titles SET poster_key = ? WHERE id = ?").bind(key, titleId).run();
}
