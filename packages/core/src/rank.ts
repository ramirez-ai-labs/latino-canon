import type { RankedHit } from "./types.js";

/**
 * Reciprocal Rank Fusion. Combines any number of ranked lists without needing the
 * underlying scores to be comparable (BM25 vs cosine are not). Standard k = 60.
 *
 * Chatterjee et al. / Cormack et al. 2009. This is the whole "hybrid search" trick —
 * no cross-encoder, no learned weights, deterministic and debuggable.
 */
export function reciprocalRankFusion(
  lists: RankedHit[][],
  opts: { k?: number; weights?: number[]; limit?: number } = {},
): RankedHit[] {
  const k = opts.k ?? 60;
  const weights = opts.weights ?? lists.map(() => 1);
  const fused = new Map<string, number>();

  lists.forEach((list, listIdx) => {
    const w = weights[listIdx] ?? 1;
    list.forEach((hit, rank) => {
      const contribution = w * (1 / (k + rank + 1));
      fused.set(hit.titleId, (fused.get(hit.titleId) ?? 0) + contribution);
    });
  });

  const ranked = [...fused.entries()]
    .map(([titleId, score]) => ({ titleId, score }))
    .sort((a, b) => b.score - a.score);

  return opts.limit ? ranked.slice(0, opts.limit) : ranked;
}

/** Normalize a raw score list to [0,1] — used only for display, not for fusion. */
export function minMaxNormalize(hits: RankedHit[]): RankedHit[] {
  if (hits.length === 0) return hits;
  const scores = hits.map((h) => h.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  return hits.map((h) => ({ titleId: h.titleId, score: (h.score - min) / span }));
}
