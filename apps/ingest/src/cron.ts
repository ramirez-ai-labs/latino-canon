import type { Env } from "./bindings.js";
import { runIngestQueue } from "./ingest-queue.js";
import { refreshPopularity, retryErroredJobs } from "./maintenance.js";

/**
 * The daily cron (08:00 UTC), with a heartbeat. Checked 2026-09-29 after a report that the
 * cron wasn't completing (ROADMAP #17): it had fired on Sep 26-28, and on Sep 29 there was
 * simply nothing to do - but D1 couldn't tell "ran with nothing to do" from "didn't run",
 * and the tasks ran under Promise.all inside waitUntil, so a task that threw was recorded
 * nowhere a person would look.
 *
 * Now every run writes one `cron_runs` row (migration 0030) with each task's count or
 * error, and the tasks run under Promise.allSettled so one failure can't hide the others.
 * `GET /cron` reads the rows back.
 */
export const CRON_TASKS = {
  queue: runIngestQueue,
  retry: retryErroredJobs,
  refresh: refreshPopularity,
} satisfies Record<string, (env: Env) => Promise<number>>;

export type CronTaskName = keyof typeof CRON_TASKS;
export type CronTasks = Record<CronTaskName, (env: Env) => Promise<number>>;

export interface CronRun {
  startedAt: string;
  durationMs: number;
  /** A task's count, or null when it failed. */
  counts: Record<CronTaskName, number | null>;
  /** A task's error message, or null when it succeeded. */
  errors: Record<CronTaskName, string | null>;
}

const NAMES = Object.keys(CRON_TASKS) as CronTaskName[];

/** Runs every task to completion, records the run, and returns it. Never throws. */
export async function runCron(env: Env, tasks: CronTasks = CRON_TASKS, now: () => Date = () => new Date()): Promise<CronRun> {
  const started = now();
  const settled = await Promise.allSettled(NAMES.map((name) => tasks[name](env)));
  const run: CronRun = {
    startedAt: started.toISOString(),
    durationMs: now().getTime() - started.getTime(),
    counts: { queue: null, retry: null, refresh: null },
    errors: { queue: null, retry: null, refresh: null },
  };
  settled.forEach((result, i) => {
    const task = NAMES[i]!;
    if (result.status === "fulfilled") {
      run.counts[task] = result.value;
    } else {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      run.errors[task] = error;
      console.warn(JSON.stringify({ event: "cron.task", task, outcome: "error", error }));
    }
  });

  try {
    await env.DB.prepare(
      `INSERT INTO cron_runs (started_at, duration_ms, queue_started, jobs_retried, titles_refreshed,
                              queue_error, retry_error, refresh_error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(
        run.startedAt,
        run.durationMs,
        run.counts.queue,
        run.counts.retry,
        run.counts.refresh,
        run.errors.queue,
        run.errors.retry,
        run.errors.refresh,
      )
      .run();
  } catch (err) {
    // The heartbeat itself failing is worth a log line, not a thrown cron: the tasks' work is done.
    console.error(JSON.stringify({ event: "cron.heartbeat", outcome: "error", error: err instanceof Error ? err.message : String(err) }));
  }
  console.warn(JSON.stringify({ event: "cron.run", ...run }));
  return run;
}

export interface CronRunRow {
  startedAt: string;
  durationMs: number;
  queueStarted: number | null;
  jobsRetried: number | null;
  titlesRefreshed: number | null;
  queueError: string | null;
  retryError: string | null;
  refreshError: string | null;
}

/** The most recent runs, newest first - `GET /cron`. */
export async function recentCronRuns(env: Env, limit = 14): Promise<CronRunRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT started_at AS startedAt, duration_ms AS durationMs, queue_started AS queueStarted,
            jobs_retried AS jobsRetried, titles_refreshed AS titlesRefreshed,
            queue_error AS queueError, retry_error AS retryError, refresh_error AS refreshError
     FROM cron_runs ORDER BY started_at DESC, id DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<CronRunRow>();
  return results;
}
