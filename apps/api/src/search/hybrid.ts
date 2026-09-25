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
 *
 * Dense retrieval needs a Workers AI embedding per query. When that fails - most often
 * the account's daily neuron budget running out, which until 00:00 UTC used to 500 every
 * search - it falls back to keyword results and reports it through `onDegraded`, so the
 * caller can flag the response and keep it out of the cache. Lexical errors (D1) still
 * throw: there's nothing cheaper left to fall back to.
 */
export async function retrieve(
  env: Env,
  opts: {
    query: string;
    mode: SearchMode;
    filters: SearchFilters;
    limit: number;
    onDegraded?: (err: unknown) => void;
  },
): Promise<RankedHit[]> {
  const { query, mode, filters, limit } = opts;
  const semanticOrNull = (k: number): Promise<RankedHit[] | null> =>
    semanticSearch(env, query, filters, k).catch((err: unknown) => {
      opts.onDegraded?.(err);
      return null;
    });

  if (mode === "lexical") return lexicalSearch(env, query, filters, limit);
  if (mode === "semantic") return (await semanticOrNull(limit)) ?? lexicalSearch(env, query, filters, limit);

  const [lexical, semantic] = await Promise.all([
    lexicalSearch(env, query, filters, CANDIDATE_POOL),
    semanticOrNull(CANDIDATE_POOL),
  ]);
  if (!semantic) return lexical.slice(0, limit);

  // Empty query = browse: fall back to whichever retriever produced anything,
  // else let the route layer do a popularity sort.
  if (lexical.length === 0 && semantic.length === 0) return [];

  return reciprocalRankFusion([lexical, semantic], {
    k: 60,
    // Tuned against the 62-query golden set (packages/eval/src/datasets/queries.jsonl)
    // once it grew past the original 15 queries / 16-title catalog: offline replay of
    // [1,1] vs [2,1] (RRF only depends on rank order, so this needed no redeploy) showed
    // [2,1] improves recall@5 (0.799→0.816), MRR, and nDCG@10 with recall@10 unchanged
    // and zero newly-broken queries - a clean win, not a trade-off. Re-tune again once
    // the query set grows further; [3,1] measured marginally better still but starts
    // looking like overfitting to this specific 62-query sample.
    weights: [2, 1],
    limit,
  });
}
