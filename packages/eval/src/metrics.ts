/** Pure ranking metrics. `ranked` is an ordered list of ids; `relevant` is the gold set. */

export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const hits = ranked.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

export function precisionAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (k === 0) return 0;
  return ranked.slice(0, k).filter((id) => relevant.has(id)).length / k;
}

/** Reciprocal rank for a single query (1/rank of first hit). */
export function reciprocalRank(ranked: string[], relevant: Set<string>): number {
  const idx = ranked.findIndex((id) => relevant.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

/** nDCG with binary relevance. */
export function ndcgAtK(ranked: string[], relevant: Set<string>, k: number): number {
  const dcg = ranked
    .slice(0, k)
    .reduce((sum, id, i) => sum + (relevant.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  let ideal = 0;
  for (let i = 0; i < Math.min(relevant.size, k); i++) ideal += 1 / Math.log2(i + 2);
  return ideal === 0 ? 0 : dcg / ideal;
}

export interface AggregateScores {
  n: number;
  "recall@5": number;
  "recall@10": number;
  "precision@5": number;
  mrr: number;
  "ndcg@10": number;
}

export function aggregate(perQuery: { ranked: string[]; relevant: string[] }[]): AggregateScores {
  const n = perQuery.length || 1;
  const acc = perQuery.reduce(
    (a, { ranked, relevant }) => {
      const rel = new Set(relevant);
      a["recall@5"] += recallAtK(ranked, rel, 5);
      a["recall@10"] += recallAtK(ranked, rel, 10);
      a["precision@5"] += precisionAtK(ranked, rel, 5);
      a.mrr += reciprocalRank(ranked, rel);
      a["ndcg@10"] += ndcgAtK(ranked, rel, 10);
      return a;
    },
    { "recall@5": 0, "recall@10": 0, "precision@5": 0, mrr: 0, "ndcg@10": 0 },
  );
  return {
    n: perQuery.length,
    "recall@5": acc["recall@5"] / n,
    "recall@10": acc["recall@10"] / n,
    "precision@5": acc["precision@5"] / n,
    mrr: acc.mrr / n,
    "ndcg@10": acc["ndcg@10"] / n,
  };
}
