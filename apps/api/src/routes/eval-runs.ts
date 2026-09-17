import { Hono } from "hono";
import type { EvalRun } from "@latino-canon/core";
import type { Env } from "../bindings.js";

export const evalRunsRoute = new Hono<{ Bindings: Env }>();

interface EvalRunRow {
  id: number;
  eval_type: string;
  run_at: string;
  n: number;
  failed: number;
  mean_score: number | null;
  metrics: string | null;
  details: string | null;
}

function toEvalRun(row: EvalRunRow): EvalRun {
  return {
    id: row.id,
    evalType: row.eval_type as EvalRun["evalType"],
    runAt: row.run_at,
    n: row.n,
    failed: row.failed,
    meanScore: row.mean_score,
    metrics: row.metrics ? JSON.parse(row.metrics) : {},
    details: row.details ? JSON.parse(row.details) : null,
  };
}

/**
 * GET /eval-runs — recent eval harness runs (packages/eval), newest first.
 * Written by CI (see .github/workflows/eval-groundedness.yml) directly via D1,
 * not through a write endpoint here - eval_runs has no admin-protected POST
 * because nothing but CI is expected to write it, and this repo's D1 write
 * access is already scoped to CI via CLOUDFLARE_API_TOKEN.
 */
evalRunsRoute.get("/", async (c) => {
  const evalType = c.req.query("type");
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);

  const { results } = evalType
    ? await c.env.DB.prepare("SELECT * FROM eval_runs WHERE eval_type = ? ORDER BY run_at DESC LIMIT ?")
        .bind(evalType, limit)
        .all<EvalRunRow>()
    : await c.env.DB.prepare("SELECT * FROM eval_runs ORDER BY run_at DESC LIMIT ?").bind(limit).all<EvalRunRow>();

  return c.json({ runs: results.map(toEvalRun) });
});

/** GET /eval-runs/:id — single run with full details for drill-down. */
evalRunsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM eval_runs WHERE id = ?").bind(id).first<EvalRunRow>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(toEvalRun(row));
});
