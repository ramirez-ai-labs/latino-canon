import { EMBEDDING_MODEL } from "@latino-canon/core";

/**
 * Embeddings always use Workers AI bge-m3 (multilingual, 1024-dim) — the runtime query
 * vector must be produced by the same model that indexed the corpus.
 */
export async function embed(ai: Ai, texts: string[]): Promise<number[][]> {
  const res = (await ai.run(EMBEDDING_MODEL as Parameters<Ai["run"]>[0], {
    text: texts,
  } as Parameters<Ai["run"]>[1])) as { data: number[][] };
  return res.data;
}

