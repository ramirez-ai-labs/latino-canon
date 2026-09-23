import { Hono } from "hono";
import type { Env } from "../bindings.js";
import { embed } from "../ai/embed.js";

export const adminRoute = new Hono<{ Bindings: Env }>();

/**
 * Rebuild Vectorize index by re-embedding all titles.
 * This is needed after backfills that add/update genres, content advisory, etc.
 * without re-running the ingest pipeline.
 */
adminRoute.post("/rebuild-vectorize", async (c) => {
  try {
    // Fetch all titles with their synopses
    const { results: titles } = await c.env.DB.prepare(
      "SELECT id, title, year_start, synopsis FROM titles ORDER BY created_at DESC",
    ).all<{ id: string; title: string; year_start: number; synopsis: string | null }>();

    if (!titles || titles.length === 0) {
      return c.json({ status: "success", message: "No titles to embed", embedded: 0 });
    }

    // Embed all synopses
    const embedTexts = titles.map(
      (t) => `${t.title} (${t.year_start}). ${t.synopsis || ""}`,
    );
    const vectors = await embed(c.env.AI, embedTexts);

    // Upsert into Vectorize
    let upserted = 0;
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      const vector = vectors[i];
      if (!title || !vector) {
        if (title) console.warn(`No vector for ${title.id}`);
        continue;
      }

      await c.env.VECTORIZE.upsert([
        {
          id: title.id,
          values: vector,
          metadata: {
            title: title.title,
            year: title.year_start,
          },
        },
      ]);
      upserted++;
    }

    return c.json({
      status: "success",
      message: `Re-embedded ${upserted} titles in Vectorize`,
      embedded: upserted,
      total: titles.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      { status: "error", message },
      { status: 500 },
    );
  }
});
