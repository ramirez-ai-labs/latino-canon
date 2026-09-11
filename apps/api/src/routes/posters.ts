import { Hono } from "hono";
import type { Env } from "../bindings.js";

export const postersRoute = new Hono<{ Bindings: Env }>();

/**
 * Serves cached poster images from R2. `titles.poster_key` stores the full R2 key
 * ("posters/<file>"); the web app's posterUrl() strips that prefix before building the
 * URL, so this route re-adds it rather than trusting the client-supplied path directly.
 */
postersRoute.get("/:file", async (c) => {
  const object = await c.env.POSTERS.get(`posters/${c.req.param("file")}`);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(object.body, { headers });
});
