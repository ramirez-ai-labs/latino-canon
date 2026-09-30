import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "./bindings.js";
import { type CronTasks, recentCronRuns, runCron } from "./cron.js";
import worker from "./index.js";

// Real D1 with migration 0030. Storage is isolated per test file, so rows accumulate
// across the tests below in order - each asserts on the newest row.
const testEnv = env as unknown as Env;

const tasks = (overrides: Partial<CronTasks> = {}): CronTasks => ({
  queue: () => Promise.resolve(15),
  retry: () => Promise.resolve(2),
  refresh: () => Promise.resolve(25),
  ...overrides,
});

// A fixed clock: 08:00:00 then 08:00:03, so the recorded duration is exact.
function clock(start: string) {
  const t0 = new Date(start).getTime();
  let calls = 0;
  return () => new Date(t0 + 3000 * calls++);
}

describe("runCron (the daily cron's heartbeat)", () => {
  it("records each task's count and the run's duration", async () => {
    const run = await runCron(testEnv, tasks(), clock("2026-10-01T08:00:00Z"));
    expect(run.counts).toEqual({ queue: 15, retry: 2, refresh: 25 });
    expect((await recentCronRuns(testEnv, 1))[0]).toEqual({
      startedAt: "2026-10-01T08:00:00.000Z",
      durationMs: 3000,
      queueStarted: 15,
      jobsRetried: 2,
      titlesRefreshed: 25,
      queueError: null,
      retryError: null,
      refreshError: null,
    });
  });

  // The 2026-09-29 case (ROADMAP #17): a day with nothing to do must still leave a row, or
  // it looks the same as a cron that never fired.
  it("records a quiet day as a row of zeros", async () => {
    await runCron(testEnv, tasks({ queue: () => Promise.resolve(0), retry: () => Promise.resolve(0), refresh: () => Promise.resolve(0) }), clock("2026-10-02T08:00:00Z"));
    expect((await recentCronRuns(testEnv, 1))[0]).toMatchObject({
      startedAt: "2026-10-02T08:00:00.000Z",
      queueStarted: 0,
      jobsRetried: 0,
      titlesRefreshed: 0,
    });
  });

  // Under Promise.all inside waitUntil, one throwing task ended the promise early and its
  // error went nowhere a person would look.
  it("records a failing task's error without losing the other tasks, and doesn't throw", async () => {
    const run = await runCron(
      testEnv,
      tasks({ queue: () => Promise.reject(new Error("TMDB 503")) }),
      clock("2026-10-03T08:00:00Z"),
    );
    expect(run.errors.queue).toBe("TMDB 503");
    expect((await recentCronRuns(testEnv, 1))[0]).toMatchObject({
      startedAt: "2026-10-03T08:00:00.000Z",
      queueStarted: null,
      queueError: "TMDB 503",
      jobsRetried: 2,
      titlesRefreshed: 25,
      retryError: null,
    });
  });

  it("returns the newest runs first, up to the limit", async () => {
    const runs = await recentCronRuns(testEnv, 2);
    expect(runs.map((r) => r.startedAt)).toEqual(["2026-10-03T08:00:00.000Z", "2026-10-02T08:00:00.000Z"]);
  });
});

describe("GET /cron", () => {
  const authed: Env = { ...testEnv, INGEST_ADMIN_TOKEN: "test-token" };

  it("is admin-only", async () => {
    const res = await worker.fetch(new Request("https://ingest.test/cron"), authed);
    expect(res.status).toBe(401);
  });

  it("returns the recorded runs, newest first", async () => {
    const res = await worker.fetch(
      new Request("https://ingest.test/cron?limit=3", { headers: { authorization: "Bearer test-token" } }),
      authed,
    );
    expect(res.status).toBe(200);
    const { runs } = await res.json<{ runs: { startedAt: string }[] }>();
    expect(runs.map((r) => r.startedAt)).toEqual([
      "2026-10-03T08:00:00.000Z",
      "2026-10-02T08:00:00.000Z",
      "2026-10-01T08:00:00.000Z",
    ]);
  });
});
