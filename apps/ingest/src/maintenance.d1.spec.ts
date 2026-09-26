import { env as testEnv } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./bindings.js";
import { persistTitle } from "./persist.js";
import { retryErroredJobs, refreshPopularity } from "./maintenance.js";

function makeTitleRow(id: string, tmdbId: number) {
  return persistTitle(testEnv, {
    id,
    tmdbId,
    imdbId: null,
    kind: "film" as const,
    title: id,
    originalTitle: null,
    yearStart: 2000,
    yearEnd: null,
    country: ["US"],
    language: ["en"],
    synopsis: null,
    posterKey: null,
    popularity: 1,
    runtime: null,
    credits: [],
    tags: [],
    blurb: null,
    representationHandling: null,
    contextNotes: [],
    oscarWin: null,
    genres: [],
    contentAdvisory: null,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("retryErroredJobs", () => {
  it("replays the exact stored params for an errored job under the attempt cap", async () => {
    const create = vi.fn().mockResolvedValue({ id: "instance-1" });
    const env = { ...testEnv, INGEST_WORKFLOW: { create } } as unknown as Env;
    const params = { ref: "Retry Me (2020)", title: "Retry Me", year: 2020, kind: "film" as const };

    await env.DB.prepare(
      "INSERT INTO ingest_jobs (id, title_ref, stage, status, attempts, params) VALUES (?,?,?,?,?,?)",
    )
      .bind("job-retry-1", params.ref, "classify", "error", 1, JSON.stringify(params))
      .run();

    await retryErroredJobs(env);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ params: { ...params, force: true } });

    const row = await env.DB.prepare("SELECT attempts FROM ingest_jobs WHERE id = ?")
      .bind("job-retry-1")
      .first<{ attempts: number }>();
    expect(row?.attempts).toBe(2);
  });

  it("skips a job the seed has since re-pinned - the ingest queue owns the new pin", async () => {
    const create = vi.fn().mockResolvedValue({ id: "instance-2" });
    const env = { ...testEnv, INGEST_WORKFLOW: { create } } as unknown as Env;
    // Heli (2013) was pinned to a 1968 cartoon (202389) until #244 re-pinned it (186935).
    const stale = { ref: "Heli (2013)", title: "Heli", year: 2013, kind: "film" as const, tmdbId: 202389 };
    await env.DB.prepare(
      "INSERT INTO ingest_jobs (id, title_ref, stage, status, attempts, params) VALUES (?,?,?,?,?,?)",
    )
      .bind("job-stale-1", stale.ref, "validate", "error", 0, JSON.stringify(stale))
      .run();

    await retryErroredJobs(env);

    expect(create).not.toHaveBeenCalledWith({ params: { ...stale, force: true } });
  });

  it("bumps attempts but does not guess params for a pre-migration job with none stored", async () => {
    // Regression case for the incident this replaces: guessing IngestParams from
    // title_ref alone (no kind/tmdbId/seedInclusionTypes) is what corrupted an
    // unrelated title (Firefly) this project already hit once.
    const create = vi.fn();
    const env = { ...testEnv, INGEST_WORKFLOW: { create } } as unknown as Env;

    await env.DB.prepare("INSERT INTO ingest_jobs (id, title_ref, stage, status, attempts) VALUES (?,?,?,?,?)")
      .bind("job-retry-2", "No Params (2020)", "classify", "error", 0)
      .run();

    await retryErroredJobs(env);

    expect(create).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT attempts FROM ingest_jobs WHERE id = ?")
      .bind("job-retry-2")
      .first<{ attempts: number }>();
    expect(row?.attempts).toBe(1);
  });

  it("does not retry a job that already hit the attempt cap", async () => {
    const create = vi.fn();
    const env = { ...testEnv, INGEST_WORKFLOW: { create } } as unknown as Env;
    const params = { ref: "Poison Job (2020)", title: "Poison Job", year: 2020, kind: "film" as const };

    await env.DB.prepare(
      "INSERT INTO ingest_jobs (id, title_ref, stage, status, attempts, params) VALUES (?,?,?,?,?,?)",
    )
      .bind("job-retry-3", params.ref, "classify", "error", 3, JSON.stringify(params))
      .run();

    await retryErroredJobs(env);

    expect(create).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT attempts FROM ingest_jobs WHERE id = ?")
      .bind("job-retry-3")
      .first<{ attempts: number }>();
    expect(row?.attempts).toBe(3); // untouched
  });

  it("does not touch a job that isn't in error status", async () => {
    const create = vi.fn();
    const env = { ...testEnv, INGEST_WORKFLOW: { create } } as unknown as Env;

    await env.DB.prepare("INSERT INTO ingest_jobs (id, title_ref, stage, status, attempts) VALUES (?,?,?,?,?)")
      .bind("job-retry-4", "Fine (2020)", "review", "needs_review", 0)
      .run();

    await retryErroredJobs(env);

    expect(create).not.toHaveBeenCalled();
  });
});

describe("refreshPopularity", () => {
  it("refreshes popularity for a title stale by 30+ days", async () => {
    await makeTitleRow("stale-title-2000", 555);
    await testEnv.DB.prepare("UPDATE titles SET updated_at = datetime('now', '-40 days') WHERE id = ?")
      .bind("stale-title-2000")
      .run();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 555, release_date: "2000-01-01", popularity: 42.5, credits: {} }),
          { status: 200 },
        ),
      ),
    );

    await refreshPopularity({ ...testEnv, TMDB_API_KEY: "test-key" } as unknown as Env);

    const row = await testEnv.DB.prepare("SELECT popularity FROM titles WHERE id = ?")
      .bind("stale-title-2000")
      .first<{ popularity: number }>();
    expect(row?.popularity).toBe(42.5);
  });

  it("does not touch a title updated recently", async () => {
    await makeTitleRow("fresh-title-2000", 556);
    // persistTitle already set updated_at to "now" - nothing to do.

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await refreshPopularity({ ...testEnv, TMDB_API_KEY: "test-key" } as unknown as Env);

    expect(fetchMock).not.toHaveBeenCalled();
    const row = await testEnv.DB.prepare("SELECT popularity FROM titles WHERE id = ?")
      .bind("fresh-title-2000")
      .first<{ popularity: number }>();
    expect(row?.popularity).toBe(1); // unchanged from makeTitleRow's initial value
  });

  it("a failed TMDB lookup for one title doesn't abort the rest of the batch", async () => {
    await makeTitleRow("bad-title-2000", 557);
    await makeTitleRow("good-title-2000", 558);
    await testEnv.DB.prepare(
      "UPDATE titles SET updated_at = datetime('now', '-40 days') WHERE id IN (?, ?)",
    )
      .bind("bad-title-2000", "good-title-2000")
      .run();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("557")) return Promise.resolve(new Response("not found", { status: 404 }));
        return Promise.resolve(
          new Response(JSON.stringify({ id: 558, release_date: "2000-01-01", popularity: 7.5, credits: {} }), {
            status: 200,
          }),
        );
      }),
    );

    await refreshPopularity({ ...testEnv, TMDB_API_KEY: "test-key" } as unknown as Env);

    const good = await testEnv.DB.prepare("SELECT popularity FROM titles WHERE id = ?")
      .bind("good-title-2000")
      .first<{ popularity: number }>();
    expect(good?.popularity).toBe(7.5);
  });
});
