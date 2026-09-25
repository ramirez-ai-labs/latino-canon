import type { Context } from "hono";
import type { Env } from "./bindings.js";

/**
 * Who a request is on behalf of, for per-caller rate limits.
 *
 * A public request always carries `cf-connecting-ip`, set by Cloudflare's edge (a client
 * can't spoof it). A request from `apps/web` arrives over the service binding without
 * one - the web worker's own fetch, not the viewer's - so without a fallback every site
 * visitor shared a single "unknown" bucket. The web worker forwards the viewer's address
 * as `x-client-ip`, and it's only read when `cf-connecting-ip` is absent, which a public
 * caller can't arrange.
 */
export function clientIp(c: Context<{ Bindings: Env }>): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-client-ip") ?? "anonymous";
}

/**
 * Per-caller limit on searches that will spend Workers AI neurons (a query-rewrite LLM
 * call and a bge-m3 embedding on every cache miss). Uses the Rate Limiting binding, not
 * KV: a KV counter costs a write per request, and the free tier's 1,000 KV writes/day are
 * already spent on the search cache itself. Absent binding (tests, `next dev` without
 * bindings) means no limit.
 */
export async function isSearchRateLimited(env: Env, key: string): Promise<boolean> {
  if (!env.SEARCH_RATE_LIMITER) return false;
  const { success } = await env.SEARCH_RATE_LIMITER.limit({ key });
  return !success;
}
