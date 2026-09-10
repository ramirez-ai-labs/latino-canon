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

/** Canonical text used to embed a title. Keep in sync with apps/ingest. */
export function titleEmbeddingText(t: {
  title: string;
  originalTitle: string | null;
  synopsis: string | null;
  themes: string[];
}): string {
  return [
    t.title,
    t.originalTitle && t.originalTitle !== t.title ? t.originalTitle : null,
    t.synopsis,
    t.themes.length ? `Themes: ${t.themes.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
