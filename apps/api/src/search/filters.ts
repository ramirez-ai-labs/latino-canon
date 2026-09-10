import type { SearchFilters } from "@latino-canon/core";
import type { VectorizeVectorMetadataFilter } from "@cloudflare/workers-types";

/** Build a SQL WHERE fragment + positional params for the structured filters. */
export function filterToSql(
  filters: SearchFilters,
  titleAlias = "t",
): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  const p = () => `?${params.length + 1}`;

  if (filters.kind) {
    clauses.push(`${titleAlias}.kind = ${p()}`);
    params.push(filters.kind);
  }
  if (filters.decade) {
    clauses.push(`${titleAlias}.year_start BETWEEN ${p()} AND ${p()}`);
    params.push(filters.decade, filters.decade + 9);
  }
  if (filters.country) {
    clauses.push(`EXISTS (SELECT 1 FROM json_each(${titleAlias}.countries) WHERE value = ${p()})`);
    params.push(filters.country);
  }
  if (filters.theme) {
    clauses.push(tagExists("theme"));
    params.push(filters.theme);
  }
  if (filters.inclusionType) {
    clauses.push(tagExists("inclusion_type"));
    params.push(filters.inclusionType);
  }

  return { where: clauses.join(" AND "), params };

  function tagExists(kind: string): string {
    return `EXISTS (
      SELECT 1 FROM title_tags tt
      JOIN tags g ON g.id = tt.tag_id
      WHERE tt.title_id = ${titleAlias}.id AND g.kind = '${kind}' AND g.slug = ?${params.length + 1}
    )`;
  }
}

/** Vectorize metadata filter equivalent — applied at query time on the vector index. */
export function filterToVectorize(filters: SearchFilters): VectorizeVectorMetadataFilter {
  const f: VectorizeVectorMetadataFilter = {};
  if (filters.kind) f.kind = filters.kind;
  if (filters.decade) f.decade = filters.decade;
  if (filters.country) f.countries = { $eq: filters.country };
  if (filters.theme) f.themes = { $eq: filters.theme };
  if (filters.inclusionType) f.inclusionTypes = { $eq: filters.inclusionType };
  return f;
}
