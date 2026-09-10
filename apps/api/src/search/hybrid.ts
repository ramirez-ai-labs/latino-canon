import {
  reciprocalRankFusion,
  type RankedHit,
  type SearchFilters,
  type SearchMode,
} from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { lexicalSearch } from "./lexical.js";
import { semanticSearch } from "./semantic.js";

const CANDIDATE_POOL = 40; // fetch this many from each retriever before fusing

/**
 * The retrieval core. `hybrid` runs BM25 + dense in parallel and fuses with RRF;
 * `lexical` / `semantic` expose the individual retrievers (used by the eval harness
 * and the search-mode toggle in the UI).
 */
export async function retrieve(
  env: Env,
  opts: { query: string; mode: SearchMode; filters: SearchFilters; limit: number },
): Promise<RankedHit[]> {
  const { query, mode, filters, limit } = opts;

  if (mode === "lexical") return lexicalSearch(env, query, filters, limit);
  if (mode === "semantic") return semanticSearch(env, query, filters, limit);

  const [lexical, semantic] = await Promise.all([
    lexicalSearch(env, query, filters, CANDIDATE_POOL),
    semanticSearch(env, query, filters, CANDIDATE_POOL),
  ]);

  // Empty query = browse: fall back to whichever retriever produced anything,
  // else let the route layer do a popularity sort.
  if (lexical.length === 0 && semantic.length === 0) return [];

  return reciprocalRankFusion([lexical, semantic], {
    k: 60,
    weights: [1, 1], // TODO: tune on packages/eval once we have relevance judgments
    limit,
  });
}
