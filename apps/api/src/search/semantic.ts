import type { RankedHit, SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { embed } from "../ai/embed.js";
import { filterToSql, filterToVectorize, needsD1PostFilter, visibilityGateSql } from "./filters.js";

/**
 * Below this cosine score, Vectorize's nearest neighbors aren't actually relevant -
 * they're just whatever's least-far in a small catalog. Observed live: an off-topic
 * query ("quantum physics research lab") scored 0.19-0.33 across the whole 16-title
 * corpus, while on-topic queries ("familia", "teacher inspires students") scored
 * 0.32-0.50 - "DC comics"/"superhero" landed in between (0.30-0.43) and returned 14 of
 * 16 titles with no real cutoff. This is a heuristic picked from those three data
 * points, not a tuned value - `pnpm eval:retrieval` against real relevance judgments
 * (packages/eval) should replace it once there's a golden query set large enough to
 * tune against, the same TODO already tracked for hybrid.ts's RRF weights.
 */
const MIN_SEMANTIC_SCORE = 0.35;

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
  // over-fetch so there's still something left after the D1 re-check narrows it. The
  // inclusion_type visibility gate always needs that re-check now (below), not just
  // when country/theme/inclusionType are set, so always over-fetch at least a little.
  const postFilter = needsD1PostFilter(filters);
  const filter = filterToVectorize(filters);
  const res = await env.VECTORIZE.query(vector, {
    topK: Math.min(postFilter ? limit * 4 : limit * 2, 100),
    returnValues: false,
    returnMetadata: "none",
    ...(Object.keys(filter).length ? { filter } : {}),
  });

  const hits = res.matches
    .filter((m) => m.score >= MIN_SEMANTIC_SCORE)
    .map((m) => ({ titleId: m.id, score: m.score }));
  if (hits.length === 0) return hits;
  return (await keepMatchingD1(env, hits, filters)).slice(0, limit);
}

/**
 * Re-check Vectorize candidates against D1: the filters Vectorize can't apply itself
 * (reuses `filterToSql`, the same WHERE `lexicalSearch` already filters correctly by),
 * plus the inclusion_type visibility gate, which every path needs regardless of
 * filters - a title with an embedded vector but no qualifying tag yet (e.g. classified
 * with low confidence) must never surface here either. Scoped to just this candidate
 * set via an `id IN (...)` clause.
 */
export async function keepMatchingD1(env: Env, hits: RankedHit[], filters: SearchFilters): Promise<RankedHit[]> {
  const ids = hits.map((h) => h.titleId);
  const idPlaceholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const { where, params } = filterToSql(filters, "t", ids.length);
  const gate = visibilityGateSql("t", ids.length + params.length);

  const { results } = await env.DB.prepare(
    `SELECT t.id AS id FROM titles t WHERE t.id IN (${idPlaceholders}) ${where ? `AND ${where}` : ""} AND ${gate.clause}`,
  )
    .bind(...ids, ...params, ...gate.params)
    .all<{ id: string }>();

  const keep = new Set(results.map((r) => r.id));
  return hits.filter((h) => keep.has(h.titleId));
}
