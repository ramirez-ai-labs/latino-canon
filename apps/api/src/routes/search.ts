import { Hono } from "hono";
import {
  searchQuerySchema,
  type QueryInterpretation,
  type SearchFilters,
  type SearchResponse,
} from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { retrieve } from "../search/hybrid.js";
import { isFillerQuery, relaxedFilterSets } from "../search/query-plan.js";
import { hydrateCards } from "../db/cards.js";
import { browseByPopularity } from "../db/browse.js";
import { rewriteQuery } from "../ai/rewrite-query.js";
import { makeLlmClient } from "../llm/index.js";

export const searchRoute = new Hono<{ Bindings: Env }>();

searchRoute.get("/", async (c) => {
  const started = Date.now();
  const parsed = searchQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const input = parsed.data;
  // Filters the caller explicitly chose (query params - e.g. a UI facet) are kept
  // separate from ones inferred from free text, so a bad inference can be dropped
  // without touching a filter the user actually asked for.
  const explicitFilters: SearchFilters = stripUndefined({
    kind: input.kind,
    decade: input.decade,
    country: input.country,
    theme: input.theme,
    inclusionType: input.inclusionType,
    genre: input.genre,
    contentAdvisory: input.contentAdvisory,
  });
  let filters: SearchFilters = { ...explicitFilters };
  let effectiveQuery = input.q;
  let interpretation: QueryInterpretation | null = null;

  // Natural-language queries: let the LLM lift filters out of the phrase.
  if (input.q) {
    interpretation = await rewriteQuery(makeLlmClient(c.env), input.q);
    if (interpretation) {
      effectiveQuery = interpretation.cleanedQuery || input.q;
      filters = { ...interpretation.filters, ...explicitFilters }; // explicit query params win
    }
  }

  // offset must be part of the key - every page of the same query/filters/limit
  // otherwise collides on one cache entry, so page 2's request could return whatever
  // page happened to be cached last (page 1's data, or page 4's, depending on timing),
  // not its own. Found live: pagination let you click "Next" well past where the real
  // title count justified it, and pages didn't reliably show their own titles.
  const cacheKey = `search:${input.mode}:${effectiveQuery}:${JSON.stringify(filters)}:${input.limit}:${input.offset}`;
  const cached = await c.env.CACHE.get<SearchResponse>(cacheKey, "json");
  if (cached) return c.json({ ...cached, tookMs: Date.now() - started });

  // When the filters carry the whole ask ("animation films" -> genre=Animation, kind=film,
  // text "films"), the leftover text only adds noise - list what matches the filters,
  // by popularity, the same way an empty query does. See isFillerQuery.
  const textQuery =
    effectiveQuery && !(Object.keys(filters).length > 0 && isFillerQuery(effectiveQuery)) ? effectiveQuery : "";
  const run = (f: SearchFilters) =>
    textQuery
      ? retrieve(c.env, { query: textQuery, mode: input.mode, filters: f, limit: input.limit })
      : browseByPopularity(c.env, f, input.limit, input.offset);

  let hits = await run(filters);

  // An inferred filter can be wrong in a way that zeroes out an otherwise-good match -
  // a decade that's the story's *setting* (docs/ROADMAP.md #16, Zoot Suit), or a country
  // guessed from a Spanish phrase. Explicit filters (UI facets) stay strict; inferred
  // ones are relaxed one at a time, least trustworthy first, so a bad country doesn't
  // take a good genre down with it. The interpretation is updated to what was actually
  // applied, so the UI never claims a filter the results don't honor.
  if (hits.length === 0 && interpretation) {
    for (const relaxed of relaxedFilterSets(filters, explicitFilters)) {
      hits = await run(relaxed);
      if (hits.length > 0) {
        const dropped = Object.keys(filters).filter((k) => !(k in relaxed));
        interpretation = {
          ...interpretation,
          filters: Object.fromEntries(Object.entries(interpretation.filters).filter(([k]) => k in relaxed)),
          rationale: `${interpretation.rationale} No matches with ${dropped.join(" + ")}, so ${dropped.length > 1 ? "those filters were" : "that filter was"} dropped.`,
        };
        break;
      }
    }
  }

  const results = await hydrateCards(c.env, hits);

  const body: SearchResponse = {
    query: input.q,
    mode: input.mode,
    interpretation,
    results,
    tookMs: Date.now() - started,
  };

  c.executionCtx.waitUntil(
    c.env.CACHE.put(cacheKey, JSON.stringify(body), {
      expirationTtl: Number(c.env.SEARCH_CACHE_TTL_SECONDS),
    }),
  );
  return c.json(body);
});

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
