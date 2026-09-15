import type { RankedHit, SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { filterToSql, visibilityGateSql } from "../search/filters.js";

/** Empty-query browse: popularity sort with the same structured filters applied. */
export async function browseByPopularity(
  env: Env,
  filters: SearchFilters,
  limit: number,
  offset: number = 0,
): Promise<RankedHit[]> {
  const { where, params } = filterToSql(filters, "t");
  const gate = visibilityGateSql("t", params.length);
  const sql = `
    SELECT t.id AS titleId, t.popularity AS score
    FROM titles t
    WHERE ${where ? `${where} AND ` : ""}${gate.clause}
    ORDER BY t.popularity DESC
    LIMIT ?
    OFFSET ?
  `;
  const { results } = await env.DB.prepare(sql)
    .bind(...params, ...gate.params, limit, offset)
    .all<{ titleId: string; score: number }>();
  return results;
}
