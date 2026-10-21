import type { BrowseSort, RankedHit, SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { filterToSql, visibilityGateSql } from "../search/filters.js";

/**
 * Every order ends on t.id: without a tiebreaker SQLite may return tied rows in any
 * order, so with OFFSET paging a tied title could show on two pages or on neither.
 */
const ORDER_BY: Record<BrowseSort, string> = {
  popular: "t.popularity DESC, t.id",
  added: "t.created_at DESC, t.id",
  year: "t.year_start DESC, t.popularity DESC, t.id",
  title: "t.title COLLATE NOCASE, t.id",
};

/** Empty-query browse: the structured filters, in the requested order (see BrowseSort). */
export async function browseTitles(
  env: Env,
  filters: SearchFilters,
  limit: number,
  offset: number = 0,
  sort: BrowseSort = "popular",
): Promise<RankedHit[]> {
  const { where, params } = filterToSql(filters, "t");
  const gate = visibilityGateSql("t", params.length);
  const sql = `
    SELECT t.id AS titleId, t.popularity AS score
    FROM titles t
    WHERE ${where ? `${where} AND ` : ""}${gate.clause}
    ORDER BY ${ORDER_BY[sort]}
    LIMIT ?
    OFFSET ?
  `;
  const { results } = await env.DB.prepare(sql)
    .bind(...params, ...gate.params, limit, offset)
    .all<{ titleId: string; score: number }>();
  return results;
}
