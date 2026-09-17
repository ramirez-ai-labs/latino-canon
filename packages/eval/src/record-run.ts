import { writeFileSync } from "node:fs";
import type { EvalType } from "@latino-canon/core";

/** Standard SQL string-literal escaping: double any embedded single quotes. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumberOrNull(value: number | null): string {
  return value === null || Number.isNaN(value) ? "NULL" : String(value);
}

/**
 * Writes a single-statement INSERT for eval_runs (migration 0016) to `outPath`,
 * so the workflow can apply it with `wrangler d1 execute --file` - JSON payloads
 * (metrics/details) get SQL-escaped here in JS rather than passed through a
 * shell command, so quotes/newlines in blurb text or model output can't break
 * or inject into the generated SQL.
 */
export function writeEvalRunSql(
  outPath: string,
  run: {
    evalType: EvalType;
    runAt: string;
    n: number;
    failed: number;
    meanScore: number | null;
    metrics: unknown;
    details: unknown;
  },
): void {
  const sql = `INSERT INTO eval_runs (eval_type, run_at, n, failed, mean_score, metrics, details) VALUES (${[
    sqlString(run.evalType),
    sqlString(run.runAt),
    run.n,
    run.failed,
    sqlNumberOrNull(run.meanScore),
    sqlString(JSON.stringify(run.metrics)),
    sqlString(JSON.stringify(run.details)),
  ].join(", ")});\n`;
  writeFileSync(outPath, sql);
}
