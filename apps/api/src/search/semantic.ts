import type { RankedHit, SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { embed } from "../ai/embed.js";
import { filterToSql, filterToVectorize, needsD1PostFilter, visibilityGateSql } from "./filters.js";

/**
 * Below this cosine score, Vectorize's nearest neighbors aren't actually relevant -
 * they're just whatever's least-far in a small catalog. Originally a heuristic picked
 * from three data points on the 16-title corpus (see git history); re-evaluated once
 * the catalog and golden set grew (62 queries, 219 titles, packages/eval/src/datasets
 * /queries.jsonl): raising it to 0.45 improves recall@5 (0.816→0.824) but costs
 * recall@10 (0.856→0.832) - a real trade-off, not a clean win like hybrid.ts's RRF
 * weight retune was, and this project's discovery-oriented use case (obscure/half-
 * remembered queries, clustered multi-answer queries) weighs recall@10 higher than a
 * small recall@5 gain. Left at 0.35 deliberately; revisit if that priority changes.
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
 *
 * D1/SQLite caps a prepared statement at 100 bound parameters total. semanticSearch's
 * topK is itself capped at 100, so a broad query (many candidates clearing the score
 * floor) can hand this function a full 100-id hit list - the `id IN (...)` clause alone
 * then uses the entire budget, and the visibility gate's own param (always added, even
 * with zero filters) pushes the statement to `?101` and D1 throws
 * "variable number must be between ?1 and ?100" (found live on "latino animation film
 * for kids"). Reserve room for the filter + gate params before deciding how many ids
 * fit - hits are already ranked by Vectorize score, so truncating the tail is the same
 * over-fetch-and-trim tradeoff topK already makes, not a new loss.
 */
export async function keepMatchingD1(env: Env, hits: RankedHit[], filters: SearchFilters): Promise<RankedHit[]> {
  const MAX_D1_PARAMS = 100;
  const reservedParams = filterToSql(filters, "t", 0).params.length + visibilityGateSql("t", 0).params.length;
  const ids = hits.slice(0, MAX_D1_PARAMS - reservedParams).map((h) => h.titleId);

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
