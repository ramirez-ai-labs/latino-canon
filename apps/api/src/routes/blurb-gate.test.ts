import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { BlurbGateDay } from "@latino-canon/core";
import app from "../index.js";

// Six blurbs across two days: today the gate approved two and held one (an ingest), and a
// rewrite replaced one old blurb while a second rewrite attempt was held (old text kept).
// Yesterday it approved one. One blurb was never judged (from before the gate).
beforeAll(async () => {
  const rows: [string, string | null, string | null, number | null, string | null][] = [
    // id, judged_at, approved_by, groundedness, regen_attempted_at
    ["gate-a-2020", "datetime('now')", "judge", 1, null],
    ["gate-b-2020", "datetime('now')", "judge", 1, null],
    ["gate-c-2020", "datetime('now')", null, 0.5, null],
    ["gate-d-2020", "datetime('now')", "judge", 1, "datetime('now')"],
    ["gate-e-2020", null, null, null, "datetime('now')"],
    ["gate-f-2020", "datetime('now', '-1 day')", "judge", 1, null],
    ["gate-g-2020", null, null, null, null],
  ];
  await env.DB.batch(
    rows.flatMap(([id, judgedAt, by, score, regenAt]) => [
      env.DB.prepare(`INSERT INTO titles (id, kind, title, year_start, countries, languages) VALUES (?1, 'film', ?1, 2020, '[]', '[]')`).bind(id),
      env.DB.prepare(
        `INSERT INTO blurbs (title_id, text, sources, model, approved, approved_by, groundedness, judge_version, judged_at, regen_attempted_at)
         VALUES (?1, 'text', '[]', 'm', ?2, ?3, ?4, ?5, ${judgedAt ?? "NULL"}, ${regenAt ?? "NULL"})`,
      ).bind(id, by === "judge" ? 1 : 0, by, score, score === null ? null : 3),
    ]),
  );
});

describe("GET /eval-runs/blurb-gate", () => {
  it("rolls up each day's verdicts and rewrite attempts, oldest first", async () => {
    const res = await app.request("/eval-runs/blurb-gate?days=7", {}, env);
    expect(res.status).toBe(200);
    const { days } = await res.json<{ days: BlurbGateDay[] }>();
    expect(days).toHaveLength(2);
    const [yesterday, today] = days;
    expect(yesterday).toMatchObject({ judged: 1, approved: 1, held: 0, rewritesAttempted: 0 });
    expect(today).toMatchObject({ judged: 4, approved: 3, held: 1, rewritesAttempted: 2, rewritesReplaced: 1 });
    expect(today!.meanScore).toBeCloseTo(0.875);
    expect(yesterday!.date < today!.date).toBe(true);
  });

  it("isn't swallowed by the /:id route", async () => {
    expect((await app.request("/eval-runs/blurb-gate", {}, env)).status).toBe(200);
  });
});
