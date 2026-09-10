import { Hono } from "hono";
import type { SearchFilters } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { browseByPopularity } from "../db/browse.js";
import { hydrateCards } from "../db/cards.js";

export const collectionsRoute = new Hono<{ Bindings: Env }>();

/** GET /collections — the launch shelf (Core Canon, Border Stories, ...). */
collectionsRoute.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, slug, title, description, kind FROM collections ORDER BY rowid",
  ).all();
  return c.json({ collections: results });
});

/**
 * GET /collections/:slug — resolve items. `curated` reads collection_items;
 * `smart` runs its stored SearchFilters through the browse path.
 */
collectionsRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const col = await c.env.DB.prepare(
    "SELECT id, slug, title, description, kind, smart_query FROM collections WHERE slug = ?",
  )
    .bind(slug)
    .first<{ id: string; slug: string; title: string; description: string; kind: string; smart_query: string | null }>();
  if (!col) return c.json({ error: "not found" }, 404);

  let hits;
  if (col.kind === "smart" && col.smart_query) {
    hits = await browseByPopularity(c.env, JSON.parse(col.smart_query) as SearchFilters, 48);
  } else {
    const { results } = await c.env.DB.prepare(
      "SELECT title_id AS titleId, (100 - ord) AS score FROM collection_items WHERE collection_id = ? ORDER BY ord",
    )
      .bind(col.id)
      .all<{ titleId: string; score: number }>();
    hits = results;
  }

  return c.json({
    id: col.id,
    slug: col.slug,
    title: col.title,
    description: col.description,
    kind: col.kind,
    items: await hydrateCards(c.env, hits),
  });
});
