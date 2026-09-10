import { Hono } from "hono";
import type { Env } from "../bindings.js";

export const titlesRoute = new Hono<{ Bindings: Env }>();

/**
 * GET /titles/:id — full Title (metadata + credits + tags + approved blurb with sources).
 *
 * TODO: single batched read (titles + credits + title_tags + blurbs), map to core `Title`,
 * 404 when missing, cache in KV for SEARCH_CACHE_TTL_SECONDS.
 */
titlesRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM titles WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ todo: "hydrate full Title", title: row });
});

/** GET /titles/:id/similar — content-based neighbors from Vectorize (V1). */
titlesRoute.get("/:id/similar", (c) => c.json({ todo: "vectorize nearest-neighbors by title id", results: [] }));
