import type { RankedHit, SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { embed } from "../ai/embed.js";
import { filterToVectorize } from "./filters.js";

/**
 * Dense retrieval over Vectorize. Embeds the query with bge-m3 and does a cosine
 * top-k, pushing structured filters down as a metadata filter so we don't waste the
 * k budget on titles that can't match.
 *
 * Note: topK is capped at 20 when returnMetadata !== "none" — we only need ids here,
 * so request "none" and hydrate from D1 later.
 */
export async function semanticSearch(
  env: Env,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<RankedHit[]> {
  if (query.trim().length < 2) return [];

  const [vector] = await embed(env.AI, [query]);
  if (!vector) return [];

  const filter = filterToVectorize(filters);
  const res = await env.VECTORIZE.query(vector, {
    topK: Math.min(limit, 100),
    returnValues: false,
    returnMetadata: "none",
    ...(Object.keys(filter).length ? { filter } : {}),
  });

  return res.matches.map((m) => ({ titleId: m.id, score: m.score }));
}
