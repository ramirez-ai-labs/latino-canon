import type { RankedHit, SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { embed } from "../ai/embed.js";
import { filterToSql, filterToVectorize, needsD1PostFilter } from "./filters.js";

/**
 * Dense retrieval over Vectorize. Embeds the query with bge-m3 and does a cosine
 * top-k, pushing structured filters down as a metadata filter so we don't waste the
 * k budget on titles that can't match.
 *
 * Note: topK is capped at 20 when returnMetadata !== "none" — we only need ids here,
 * so request "none" and hydrate from D1 later.
 */
export async function semanticSearch(
  env: Env,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<RankedHit[]> {
  if (query.trim().length < 2) return [];

  const [vector] = await embed(env.AI, [query]);
  if (!vector) return [];

  // country/theme/inclusionType can't be pushed down to Vectorize (see filterToVectorize) -
  // over-fetch so there's still something left after the D1 post-filter narrows it.
  const postFilter = needsD1PostFilter(filters);
  const filter = filterToVectorize(filters);
  const res = await env.VECTORIZE.query(vector, {
    topK: postFilter ? Math.min(limit * 4, 100) : Math.min(limit, 100),
    returnValues: false,
    returnMetadata: "none",
    ...(Object.keys(filter).length ? { filter } : {}),
  });

  const hits = res.matches.map((m) => ({ titleId: m.id, score: m.score }));
  if (!postFilter || hits.length === 0) return hits.slice(0, limit);
  return (await keepMatchingD1(env, hits, filters)).slice(0, limit);
}

/**
 * Re-check Vectorize candidates against D1 for the filters it can't apply itself.
 * Reuses `filterToSql` (the same WHERE `lexicalSearch` already filters correctly by),
 * scoped to just this candidate set via an `id IN (...)` clause.
 */
export async function keepMatchingD1(env: Env, hits: RankedHit[], filters: SearchFilters): Promise<RankedHit[]> {
  const ids = hits.map((h) => h.titleId);
  const idPlaceholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const { where, params } = filterToSql(filters, "t", ids.length);

  const { results } = await env.DB.prepare(
    `SELECT t.id AS id FROM titles t WHERE t.id IN (${idPlaceholders}) ${where ? `AND ${where}` : ""}`,
  )
    .bind(...ids, ...params)
    .all<{ id: string }>();

  const keep = new Set(results.map((r) => r.id));
  return hits.filter((h) => keep.has(h.titleId));
}
