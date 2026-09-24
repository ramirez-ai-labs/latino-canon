import { Hono } from "hono";
import {
  searchQuerySchema,
  type QueryInterpretation,
  type SearchFilters,
  type SearchResponse,
} from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { runSearch } from "../search/run-search.js";
import { hydrateCards } from "../db/cards.js";
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
  // v2: inferred filters became ranking boosts for content queries (run-search.ts) - a new
  // prefix so results cached under the old strict semantics are never served.
  const cacheKey = `search:v2:${input.mode}:${effectiveQuery}:${JSON.stringify(filters)}:${input.limit}:${input.offset}`;
  const cached = await c.env.CACHE.get<SearchResponse>(cacheKey, "json");
  if (cached) return c.json({ ...cached, tookMs: Date.now() - started });

  // How inferred filters are applied - strict for a filter-only query, a ranking boost
  // otherwise - lives in runSearch, shared with the curation agent.
  const plan = await runSearch(c.env, {
    query: effectiveQuery,
    mode: input.mode,
    explicit: explicitFilters,
    inferred: interpretation?.filters ?? {},
    limit: input.limit,
    offset: input.offset,
  });
  const hits = plan.hits;
  if (interpretation) {
    interpretation = {
      ...interpretation,
      // Only what was actually applied, so the UI never claims a filter the results don't honor.
      filters: Object.fromEntries(Object.entries(interpretation.filters).filter(([k]) => k in plan.applied)),
      filterMode: plan.filterMode,
      rationale: plan.dropped.length
        ? `${interpretation.rationale} No matches with ${plan.dropped.join(" + ")}, so ${plan.dropped.length > 1 ? "those filters were" : "that filter was"} dropped.`
        : interpretation.rationale,
    };
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
