import { MODEL_TAG_DISPLAY_THRESHOLD, type SearchFilters } from "@latino-canon/core";
import type { VectorizeVectorMetadataFilter } from "@cloudflare/workers-types";

/**
 * Build a SQL WHERE fragment + positional params for the structured filters.
 *
 * `paramOffset` is how many `?N` placeholders the caller already bound ahead of these
 * (e.g. lexical.ts's `MATCH ?1`) - without it, this function's own placeholders start
 * back at `?1` and collide with the caller's, so a filter combined with a text query
 * silently compares against the wrong bound value instead of erroring. Every placeholder
 * here is also computed and pushed to `params` in the same step, never precomputed twice
 * on one line - two `p()` calls before either push (the old BETWEEN clause) return the
 * same number since neither has incremented `params` yet.
 */
export function filterToSql(
  filters: SearchFilters,
  titleAlias = "t",
  paramOffset = 0,
): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  const p = () => `?${paramOffset + params.length + 1}`;

  if (filters.kind) {
    const ph = p();
    params.push(filters.kind);
    clauses.push(`${titleAlias}.kind = ${ph}`);
  }
  if (filters.decade) {
    const lo = p();
    params.push(filters.decade);
    const hi = p();
    params.push(filters.decade + 9);
    clauses.push(`${titleAlias}.year_start BETWEEN ${lo} AND ${hi}`);
  }
  if (filters.country) {
    const ph = p();
    params.push(filters.country);
    clauses.push(`EXISTS (SELECT 1 FROM json_each(${titleAlias}.countries) WHERE value = ${ph})`);
  }
  if (filters.theme) {
    const ph = p();
    params.push(filters.theme);
    clauses.push(tagExists("theme", ph));
  }
  if (filters.inclusionType) {
    const ph = p();
    params.push(filters.inclusionType);
    clauses.push(tagExists("inclusion_type", ph));
  }

  return { where: clauses.join(" AND "), params };

  function tagExists(kind: string, placeholder: string): string {
    return `EXISTS (
      SELECT 1 FROM title_tags tt
      JOIN tags g ON g.id = tt.tag_id
      WHERE tt.title_id = ${titleAlias}.id AND g.kind = '${kind}' AND g.slug = ${placeholder}
    )`;
  }
}

/**
 * taxonomy.ts: "a title qualifies for the canon iff it carries >= 1 inclusion_type
 * tag" - this is that rule as a WHERE fragment. Must be applied inside every
 * LIMIT-bearing candidate query (browseByPopularity, lexicalSearch, semanticSearch's
 * D1 re-check), never only as a post-filter on an already-limited result set - a
 * post-filter can shrink a page below what was requested without the caller knowing
 * there's more to fetch. Found live: browseByPopularity's top-51-by-popularity window
 * included titles that hadn't earned a tag yet, hydrateCards' downstream filter
 * silently returned 49, and pagination's "is there a next page" check
 * (`results.length > 50`) broke because 49 is not greater than 50.
 *
 * Same bar as MODEL_TAG_DISPLAY_THRESHOLD gates on for whether a model tag is even
 * shown - if it's not trusted enough to display, it's not trusted enough to justify
 * listing the title at all.
 */
export function visibilityGateSql(titleAlias: string, paramOffset = 0): { clause: string; params: [number] } {
  const ph = `?${paramOffset + 1}`;
  return {
    clause: `EXISTS (
      SELECT 1 FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
      WHERE tt.title_id = ${titleAlias}.id AND g.kind = 'inclusion_type'
        AND (tt.source != 'model' OR tt.confidence >= ${ph})
    )`,
    params: [MODEL_TAG_DISPLAY_THRESHOLD],
  };
}

/**
 * Vectorize metadata filter equivalent — applied at query time on the vector index.
 *
 * Only `kind` and `decade` are pushed down here: Vectorize metadata values must be a
 * scalar (string/number/boolean/null; see Cloudflare's Vectorize filtering docs), but
 * `countries`/`themes`/`inclusionTypes` are stored as arrays (a title can have more than
 * one of each) since Vectorize has no "array contains" filter operator. `{ $eq: "MX" }`
 * against an array-valued field never matches, so a text query combined with a
 * country/theme/inclusionType filter silently returned zero rows in semantic mode.
 * `semanticSearch` re-checks those three against D1 instead (see `filterToSql` above,
 * the source of truth `lexicalSearch` already filters against correctly).
 */
export function filterToVectorize(filters: SearchFilters): VectorizeVectorMetadataFilter {
  const f: VectorizeVectorMetadataFilter = {};
  if (filters.kind) f.kind = filters.kind;
  if (filters.decade) f.decade = filters.decade;
  return f;
}

/** True when `filters` has a constraint `filterToVectorize` can't push down to Vectorize. */
export function needsD1PostFilter(filters: SearchFilters): boolean {
  return Boolean(filters.country || filters.theme || filters.inclusionType);
}
