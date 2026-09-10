import { Hono } from "hono";
import { feedbackSchema } from "@latino-canon/core";
import type { Env } from "../bindings.js";

export const feedbackRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /feedback — human-in-the-loop signal from the UI:
 *   - blurb_helpful (👍/👎 on a generated blurb)
 *   - wrong_inclusion (a title flagged as miscategorized)
 *   - missing_title (a suggestion)
 * Feeds the review queue and the eval set.
 */
feedbackRoute.post("/", async (c) => {
  const parsed = feedbackSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { titleId, kind, value } = parsed.data;

  await c.env.DB.prepare("INSERT INTO feedback (title_id, kind, value) VALUES (?, ?, ?)")
    .bind(titleId, kind, JSON.stringify(value))
    .run();

  // TODO: on wrong_inclusion, open an ingest_jobs review row for that title.
  return c.json({ ok: true });
});
