import type { RankedHit } from "@latino-canon/core";
import type { Env } from "../bindings.js";

/**
 * Title-to-title neighbors don't spread like query-to-title ones: sampled live
 * (2026-09-27), every title's top 11 neighbors scored 0.59-0.80 (Coco -> Encanto 0.70,
 * The Book of Life 0.66; Selena -> Selena: The Series 0.80, Celia 0.65), so semantic.ts's
 * 0.35 query floor would never bind. This floor only drops a genuine outlier - a title
 * with nothing like it in the catalog shows fewer neighbors, not unrelated ones.
 */
export const MIN_SIMILAR_SCORE = 0.5;
export const MAX_SIMILAR = 12;

/**
 * Content-based neighbors of a title: Vectorize's query-by-id against the title's own
 * stored vector (the same bge-m3 embedding search uses), so there's no embedding call -
 * zero Workers AI neurons. Returns ranked hits for hydrateCards, which applies the
 * canon's visibility gate; the caller has already confirmed the title itself is visible.
 * A title with no vector yet (mid-ingest) has no neighbors: an empty list, not an error.
 */
export async function similarTitleHits(env: Env, titleId: string, limit: number): Promise<RankedHit[]> {
  // +1 for the title itself, which is always its own nearest neighbor. Over-fetch a
  // little more for neighbors the visibility gate drops (classified, not yet tagged).
  const res = await env.VECTORIZE.queryById(titleId, { topK: limit + 6, returnValues: false, returnMetadata: "none" }).catch(
    (err: unknown) => {
      // Vectorize rejects an id it doesn't hold. That's "no neighbors yet", not a 500.
      console.warn(
        JSON.stringify({ event: "similar", outcome: "no_vector", titleId, error: err instanceof Error ? err.message : String(err) }),
      );
      return null;
    },
  );
  if (!res) return [];
  return res.matches
    .filter((m) => m.id !== titleId && m.score >= MIN_SIMILAR_SCORE)
    .map((m) => ({ titleId: m.id, score: m.score }));
}
