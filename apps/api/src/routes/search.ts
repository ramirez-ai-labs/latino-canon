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
  let filters: SearchFilters = {
    kind: input.kind,
    decade: input.decade,
    country: input.country,
    theme: input.theme,
    inclusionType: input.inclusionType,
  };
  let effectiveQuery = input.q;
  let interpretation: QueryInterpretation | null = null;

  // Natural-language queries: let the LLM lift filters out of the phrase.
  if (input.q) {
    interpretation = await rewriteQuery(makeLlmClient(c.env), input.q);
    if (interpretation) {
      effectiveQuery = interpretation.cleanedQuery || input.q;
      filters = { ...interpretation.filters, ...stripUndefined(filters) }; // explicit query params win
    }
  }

  const cacheKey = `search:${input.mode}:${effectiveQuery}:${JSON.stringify(filters)}:${input.limit}`;
  const cached = await c.env.CACHE.get<SearchResponse>(cacheKey, "json");
  if (cached) return c.json({ ...cached, tookMs: Date.now() - started });

  const hits = effectiveQuery
    ? await retrieve(c.env, { query: effectiveQuery, mode: input.mode, filters, limit: input.limit })
    : await browseByPopularity(c.env, filters, input.limit, input.offset);

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
