import { Hono } from "hono";
import type { Env } from "../bindings.js";
import { MODEL_TAG_DISPLAY_THRESHOLD, titleEmbeddingText, titleVectorMetadata } from "@latino-canon/core";
import { embed } from "../ai/embed.js";

const router = new Hono<{ Bindings: Env }>();

// Re-embed all titles with current genre/advisory data
router.post("/rebuild-vectorize", async (c) => {
  const env = c.env;
  const pageSize = 20;
  let offset = 0;
  let totalEmbedded = 0;
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM titles").first<{ n: number }>())?.n ?? 0;

  try {
    while (true) {
      const { results: rows } = await env.DB.prepare(
        `SELECT t.id, t.kind, t.title, t.original_title, t.synopsis, t.year_start, t.genres,
           (SELECT json_group_array(g.slug) FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
            WHERE tt.title_id = t.id AND g.kind = 'theme'
              AND (tt.source != 'model' OR tt.confidence >= ?3)) AS themes
         FROM titles t ORDER BY t.id LIMIT ?1 OFFSET ?2`,
      )
        .bind(pageSize, offset, MODEL_TAG_DISPLAY_THRESHOLD)
        .all<{
          id: string;
          kind: "film" | "series" | "special";
          title: string;
          original_title: string | null;
          synopsis: string | null;
          year_start: number;
          genres: string | null;
          themes: string;
        }>();

      if (rows.length === 0) break;

      const vectors = await embed(
        env.AI,
        rows.map((r) =>
          titleEmbeddingText({
            title: r.title,
            originalTitle: r.original_title,
            synopsis: r.synopsis,
            themes: JSON.parse(r.themes ?? "[]") as string[],
            genres: JSON.parse(r.genres ?? "[]") as string[],
          }),
        ),
      );

      await env.VECTORIZE.upsert(
        rows.map((r, i) => ({
          id: r.id,
          values: vectors[i]!,
          metadata: titleVectorMetadata({ kind: r.kind, yearStart: r.year_start }),
        })),
      );

      totalEmbedded += rows.length;
      offset += pageSize;

      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return c.json({ embedded: totalEmbedded, total, status: "success" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message, embedded: totalEmbedded, total }, { status: 500 });
  }
});

export { router as adminRoute };
