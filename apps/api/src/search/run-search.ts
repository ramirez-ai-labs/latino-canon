import { MODEL_TAG_DISPLAY_THRESHOLD, type RankedHit, type SearchFilters, type SearchMode } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { browseByPopularity } from "../db/browse.js";
import { retrieve } from "./hybrid.js";
import {
  countFacetMatches,
  isFillerQuery,
  relaxedFilterSets,
  rerankWithBoosts,
  type TitleFacets,
} from "./query-plan.js";

/** Pool re-ranked by inferred-filter boosts - wider than a page so a boost has something to lift. */
const BOOST_POOL = 50;

export interface SearchPlanResult {
  hits: RankedHit[];
  /** Filters that constrained or boosted the results (explicit + surviving inferred). */
  applied: SearchFilters;
  /** Inferred filters dropped because they matched nothing (filter-only queries). */
  dropped: string[];
  /** strict = inferred filters excluded titles; boost = they only re-ranked. */
  filterMode: "strict" | "boost";
}

/**
 * The one rule for how structured filters meet free text, shared by /search and the
 * curation agent:
 *
 * - Explicit filters (UI facets, query params) always exclude.
 * - Filter-only query ("animation films" -> text "films"): the filters are the whole
 *   ask, so they exclude too - listed by popularity, relaxed one at a time if nothing
 *   matches (see isFillerQuery / relaxedFilterSets).
 * - Query with real content ("Lin-Manuel Miranda musical Washington Heights"): inferred
 *   filters only re-rank. Found by the retrieval eval: treating them as hard filters
 *   dropped hybrid recall@5 from 0.832 to 0.678. The rewrite routinely emits 4-5 guesses
 *   and one wrong one excludes the answer before ranking runs - genre=Music removed In
 *   the Heights (TMDB: Drama, Romance), kind=film removed Money Heist (a series).
 */
export async function runSearch(
  env: Env,
  opts: {
    query: string;
    mode: SearchMode;
    explicit: SearchFilters;
    inferred: SearchFilters;
    limit: number;
    offset: number;
  },
): Promise<SearchPlanResult> {
  const { query, mode, explicit, limit, offset } = opts;
  const definedInferred = Object.fromEntries(Object.entries(opts.inferred).filter(([, v]) => v !== undefined));
  const all: SearchFilters = { ...definedInferred, ...explicit };
  const inferred: SearchFilters = Object.fromEntries(Object.entries(definedInferred).filter(([k]) => !(k in explicit)));

  if (!query || (Object.keys(all).length > 0 && isFillerQuery(query))) {
    let hits = await browseByPopularity(env, all, limit, offset);
    if (hits.length > 0) return { hits, applied: all, dropped: [], filterMode: "strict" };
    for (const relaxed of relaxedFilterSets(all, explicit)) {
      hits = await browseByPopularity(env, relaxed, limit, offset);
      if (hits.length > 0) {
        return { hits, applied: relaxed, dropped: Object.keys(all).filter((k) => !(k in relaxed)), filterMode: "strict" };
      }
    }
    return { hits: [], applied: all, dropped: [], filterMode: "strict" };
  }

  if (Object.keys(inferred).length === 0) {
    const hits = await retrieve(env, { query, mode, filters: explicit, limit });
    return { hits, applied: explicit, dropped: [], filterMode: "strict" };
  }

  const pool = await retrieve(env, { query, mode, filters: explicit, limit: Math.max(limit, BOOST_POOL) });
  const facets = await loadFacets(env, pool.map((h) => h.titleId));
  const hits = rerankWithBoosts(pool, (id) => {
    const f = facets.get(id);
    return f ? countFacetMatches(f, inferred) : 0;
  }).slice(0, limit);
  return { hits, applied: all, dropped: [], filterMode: "boost" };
}

async function loadFacets(env: Env, ids: string[]): Promise<Map<string, TitleFacets>> {
  if (ids.length === 0) return new Map();
  // ids <= BOOST_POOL (50) + 1 threshold param - well inside D1's 100-bound-param cap.
  const placeholders = ids.map((_, i) => `?${i + 2}`).join(",");
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.kind, t.year_start, t.countries, t.genres, t.content_advisory,
       (SELECT json_group_array(g.kind || ':' || g.slug) FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
        WHERE tt.title_id = t.id AND (tt.source != 'model' OR tt.confidence >= ?1)) AS tags
     FROM titles t WHERE t.id IN (${placeholders})`,
  )
    .bind(MODEL_TAG_DISPLAY_THRESHOLD, ...ids)
    .all<{
      id: string;
      kind: string;
      year_start: number;
      countries: string | null;
      genres: string | null;
      content_advisory: string | null;
      tags: string;
    }>();
  return new Map(
    results.map((r) => [
      r.id,
      {
        kind: r.kind,
        yearStart: r.year_start,
        countries: JSON.parse(r.countries ?? "[]") as string[],
        genres: JSON.parse(r.genres ?? "[]") as string[],
        contentAdvisory: r.content_advisory,
        tags: JSON.parse(r.tags) as string[],
      },
    ]),
  );
}
