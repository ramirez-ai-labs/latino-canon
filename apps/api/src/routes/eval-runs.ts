import { Hono } from "hono";
import type { BlurbGateDay, EvalRun } from "@latino-canon/core";
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

/**
 * GET /eval-runs/blurb-gate?days=14 — the ingest blurb gate, one row per UTC day, oldest
 * first: what the v3 judge approved and held, and the rewrite backlog's progress. Every
 * new blurb is judged at ingest (#261), so this is a daily groundedness signal that costs
 * nothing - unlike a full groundedness run (~2.8k neurons). Registered before /:id, which
 * would otherwise take "blurb-gate" as a run id.
 */
evalRunsRoute.get("/blurb-gate", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 14) || 14, 1), 90);
  const since = `-${days - 1} days`;
  const [verdicts, rewrites] = await Promise.all([
    c.env.DB.prepare(
      `SELECT date(judged_at) AS d, COUNT(*) AS judged, SUM(approved_by = 'judge') AS approved,
              AVG(groundedness) AS meanScore
       FROM blurbs WHERE judged_at >= date('now', ?1) GROUP BY d`,
    )
      .bind(since)
      .all<{ d: string; judged: number; approved: number; meanScore: number | null }>(),
    c.env.DB.prepare(
      `SELECT date(regen_attempted_at) AS d, COUNT(*) AS attempted,
              SUM(approved_by = 'judge' AND date(judged_at) = date(regen_attempted_at)) AS replaced
       FROM blurbs WHERE regen_attempted_at >= date('now', ?1) GROUP BY d`,
    )
      .bind(since)
      .all<{ d: string; attempted: number; replaced: number }>(),
  ]);

  const byDate = new Map<string, BlurbGateDay>();
  const day = (d: string) =>
    byDate.get(d) ??
    byDate
      .set(d, { date: d, judged: 0, approved: 0, held: 0, meanScore: null, rewritesAttempted: 0, rewritesReplaced: 0 })
      .get(d)!;
  for (const v of verdicts.results) Object.assign(day(v.d), { judged: v.judged, approved: v.approved, held: v.judged - v.approved, meanScore: v.meanScore });
  for (const r of rewrites.results) Object.assign(day(r.d), { rewritesAttempted: r.attempted, rewritesReplaced: r.replaced });

  return c.json({ days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) });
});

/** GET /eval-runs/:id — single run with full details for drill-down. */
evalRunsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM eval_runs WHERE id = ?").bind(id).first<EvalRunRow>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(toEvalRun(row));
});
