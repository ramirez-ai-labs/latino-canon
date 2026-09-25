import { Hono } from "hono";
import type { Env } from "../bindings.js";
import { curate } from "../agents/curation-agent.js";
import { clientIp } from "../rate-limit.js";
import type { CurationRequest, CurationResponse } from "../agents/types.js";

export const agentsRoute = new Hono<{ Bindings: Env }>();

const MAX_QUERY_LENGTH = 300; // matches searchQuerySchema's precedent (packages/core/src/schema.ts)
const RATE_LIMIT_PER_MINUTE = 10; // per IP - each request can cost up to ~2 Workers AI calls

// Deliberately conservative, not a precisely-tuned economic optimum - this project has
// no per-model neuron-cost figures precise enough to compute a "correct" number, and
// the account-wide daily cap is only 10k total, shared with /search and ingest with
// nothing else coordinating between them (docs/ROADMAP.md #15 - a real in-code tracker
// across ALL Workers AI usage is still open, this only covers this one endpoint). This
// exists so a popular demo day or a many-IP burst - which the per-IP limit below can't
// catch - has a hard ceiling on THIS endpoint specifically, well under the account cap.
const DAILY_BUDGET = 200;

/**
 * Fixed-window per-IP limit using the same KV namespace /search already caches into -
 * no new binding. Good enough to stop a scripted burst from burning the account-wide
 * Workers AI neuron budget (docs/operations/monitoring.md incident #3) without needing
 * a Durable Object for a precise sliding window.
 */
export async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `ratelimit:agents:${ip}:${bucket}`;
  const current = Number((await env.CACHE.get(key)) ?? "0");
  if (current >= RATE_LIMIT_PER_MINUTE) return true;
  await env.CACHE.put(key, String(current + 1), { expirationTtl: 90 });
  return false;
}

/** Account-wide (not per-IP) daily cap - the thing the per-IP limit above can't catch. */
export async function isDailyBudgetExhausted(env: Env): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10); // UTC date, matches the neuron budget's own 00:00 UTC reset
  const key = `agents:curate:daily-count:${today}`;
  const current = Number((await env.CACHE.get(key)) ?? "0");
  if (current >= DAILY_BUDGET) return true;
  await env.CACHE.put(key, String(current + 1), { expirationTtl: 90_000 }); // a bit over 24h, covers clock drift
  return false;
}

/**
 * POST /agents/curate
 * Curation agent: interprets natural language -> runs a hybrid search -> synthesizes
 * results with a visible reasoning trail. Cached in KV (same TTL as /search) since
 * this costs several times what a plain search does - a repeated or popular query
 * shouldn't pay that cost twice.
 */
agentsRoute.post("/curate", async (c) => {
  let body: CurationRequest;
  try {
    body = await c.req.json<CurationRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.query || typeof body.query !== "string" || !body.query.trim()) {
    return c.json({ error: "Missing 'query' field" }, 400);
  }
  if (body.query.length > MAX_QUERY_LENGTH) {
    return c.json({ error: `'query' must be ${MAX_QUERY_LENGTH} characters or fewer` }, 400);
  }

  // Cache check comes before either cost guard below - a hit costs zero Workers AI
  // calls, so it shouldn't count against a per-IP or account-wide budget meant to
  // bound exactly that cost.
  const cacheKey = `agents:curate:${body.query.trim().toLowerCase()}:${body.limit ?? 5}`;
  const cached = await c.env.CACHE.get<CurationResponse>(cacheKey, "json");
  if (cached) {
    console.warn(JSON.stringify({ event: "agents.curate", outcome: "cache_hit", query: body.query }));
    return c.json({ ...cached, cached: true });
  }

  const ip = clientIp(c);
  if (await isRateLimited(c.env, ip)) {
    console.warn(JSON.stringify({ event: "agents.curate", outcome: "rate_limited", query: body.query }));
    return c.json({ error: "Rate limit exceeded - try again in a minute" }, 429);
  }
  if (await isDailyBudgetExhausted(c.env)) {
    console.warn(JSON.stringify({ event: "agents.curate", outcome: "budget_exhausted", query: body.query }));
    return c.json({ error: "Daily request budget exhausted - try again after the daily reset (00:00 UTC)" }, 429);
  }

  try {
    const response = await curate(c.env, body);
    c.executionCtx.waitUntil(
      c.env.CACHE.put(cacheKey, JSON.stringify(response), {
        expirationTtl: Number(c.env.SEARCH_CACHE_TTL_SECONDS),
      }),
    );
    return c.json(response);
  } catch (err) {
    return c.json({ error: `Agent error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

/**
 * GET /agents/health
 * Health check for agent service
 */
agentsRoute.get("/health", (c) => {
  return c.json({
    service: "latino-canon-agents",
    status: "ok",
    agents: ["curation"],
  });
});
