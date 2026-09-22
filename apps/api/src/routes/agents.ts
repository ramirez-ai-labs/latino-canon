import { Hono } from "hono";
import type { Env } from "../bindings.js";
import { curate } from "../agents/curation-agent.js";
import type { CurationRequest, CurationResponse } from "../agents/types.js";

export const agentsRoute = new Hono<{ Bindings: Env }>();

const MAX_QUERY_LENGTH = 300; // matches searchQuerySchema's precedent (packages/core/src/schema.ts)
const RATE_LIMIT_PER_MINUTE = 10; // per IP - each request can cost up to ~2 Workers AI calls

/**
 * Fixed-window per-IP limit using the same KV namespace /search already caches into -
 * no new binding. Good enough to stop a scripted burst from burning the account-wide
 * Workers AI neuron budget (docs/operations/monitoring.md incident #3) without needing
 * a Durable Object for a precise sliding window.
 */
async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `ratelimit:agents:${ip}:${bucket}`;
  const current = Number((await env.CACHE.get(key)) ?? "0");
  if (current >= RATE_LIMIT_PER_MINUTE) return true;
  await env.CACHE.put(key, String(current + 1), { expirationTtl: 90 });
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

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (await isRateLimited(c.env, ip)) {
    return c.json({ error: "Rate limit exceeded - try again in a minute" }, 429);
  }

  const cacheKey = `agents:curate:${body.query.trim().toLowerCase()}:${body.limit ?? 5}`;
  const cached = await c.env.CACHE.get<CurationResponse>(cacheKey, "json");
  if (cached) return c.json({ ...cached, cached: true });

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
