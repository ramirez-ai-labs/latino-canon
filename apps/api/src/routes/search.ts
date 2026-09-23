import { Hono } from "hono";
import {
  searchQuerySchema,
  type QueryInterpretation,
  type SearchFilters,
  type SearchResponse,
} from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { retrieve } from "../search/hybrid.js";
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

  let hits = effectiveQuery
    ? await retrieve(c.env, { query: effectiveQuery, mode: input.mode, filters, limit: input.limit })
    : await browseByPopularity(c.env, filters, input.limit, input.offset);

  // An inferred filter can be wrong in a way that zeroes out an otherwise-good match -
  // e.g. a decade mentioned as a film's *setting* ("1940s Los Angeles pachuco riots
  // stage musical" -> Zoot Suit, released 1981) gets read as a release-year filter and
  // excludes the correct title entirely (docs/ROADMAP.md #16). A filter the caller
  // explicitly asked for (a UI facet) should stay strict and just return zero; only an
  // inferred one gets retried without it, on the same "return something over nothing"
  // logic hybrid.ts already uses for an empty browse query.
  if (hits.length === 0 && effectiveQuery && interpretation) {
    const hasInferredFilter = Object.keys(interpretation.filters).some((k) => !(k in explicitFilters));
    if (hasInferredFilter) {
      hits = await retrieve(c.env, { query: effectiveQuery, mode: input.mode, filters: explicitFilters, limit: input.limit });
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
