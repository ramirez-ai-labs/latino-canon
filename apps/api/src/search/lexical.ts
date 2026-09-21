import type { RankedHit, SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { filterToSql, visibilityGateSql } from "./filters.js";

/**
 * BM25 lexical search over the FTS5 index. Returns title ids ranked by relevance.
 * `bm25()` returns a negative number where lower = better, so we negate for RankedHit.
 */
export async function lexicalSearch(
  env: Env,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<RankedHit[]> {
  const match = toFtsMatch(query);
  if (!match) return [];

  const { where, params } = filterToSql(filters, "t", 1); // ?1 is already MATCH below
  const gate = visibilityGateSql("t", 1 + params.length);

  // Weights, in titles_fts column order: title, original_title, synopsis, people,
  // tags, aliases. Aliases sit just under title itself (3.0 vs 4.0) - matching a
  // known alternate name is nearly as strong a signal as matching the display title,
  // stronger than matching original_title (which is often the same language as
  // title and adds less disambiguating value).
  const sql = `
    SELECT t.id AS titleId, -bm25(titles_fts, 4.0, 2.0, 1.0, 2.0, 1.5, 3.0) AS score
    FROM titles_fts
    JOIN titles t ON t.rowid = titles_fts.rowid
    WHERE titles_fts MATCH ?1
      ${where ? `AND ${where}` : ""}
      AND ${gate.clause}
    ORDER BY score DESC
    LIMIT ?${params.length + 3}
  `;

  const { results } = await env.DB.prepare(sql)
    .bind(match, ...params, ...gate.params, limit)
    .all<{ titleId: string; score: number }>();

  return results.map((r) => ({ titleId: r.titleId, score: r.score }));
}

/**
 * Turn a user string into a safe FTS5 MATCH expression: quote each token as a prefix
 * term and OR them. Drops FTS operator characters.
 */
function toFtsMatch(query: string): string | null {
  const tokens = query
    .toLowerCase()
    .replace(/["()*:^-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(" OR ");
}
