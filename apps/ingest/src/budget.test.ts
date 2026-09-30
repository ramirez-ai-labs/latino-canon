import { describe, expect, it } from "vitest";
import { budgetDay, decideClaim } from "./budget.js";

describe("decideClaim - the Workers AI budget rule", () => {
  it("allows an optional 70B job on a day with nothing else", () => {
    expect(decideClaim("eval-mcp-tools", [], false)).toEqual({ allow: true, override: false });
  });

  it("refuses a second, different 70B job the same day", () => {
    const d = decideClaim("eval-groundedness", ["blurb-regen"], false);
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toMatch(/one a day/);
  });

  it("lets the same job run again the same day - regeneration runs a day's batch in calls of 10", () => {
    expect(decideClaim("blurb-regen", ["blurb-regen"], false)).toEqual({ allow: true, override: false });
  });

  it("refuses a full groundedness run on a day the queue or a manual ingest ran - the 2026-09-27 breach", () => {
    for (const ingest of ["ingest-queue", "ingest-manual"]) {
      const d = decideClaim("eval-groundedness", [ingest], false);
      expect(d.allow).toBe(false);
      if (!d.allow) expect(d.reason).toMatch(/ingest day/);
    }
  });

  it("refuses a full groundedness run when the queue still has titles waiting, before the 08:00 cron runs", () => {
    const d = decideClaim("eval-groundedness", [], true);
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toMatch(/queue has titles waiting/);
  });

  it("allows the smaller 70B jobs on an ingest day - the queue runs daily, so the old rule blocked everything", () => {
    for (const kind of ["blurb-regen", "eval-mcp-tools", "eval-classifier", "eval-curation"] as const) {
      expect(decideClaim(kind, ["ingest-queue"], true)).toEqual({ allow: true, override: false });
    }
  });

  it("turns a refusal into a recorded override only with a written reason", () => {
    expect(decideClaim("eval-groundedness", ["ingest-queue"], false, "measure the new judge before the talk")).toEqual({
      allow: true,
      override: true,
    });
    expect(decideClaim("eval-groundedness", ["ingest-queue"], false, "   ").allow).toBe(false);
  });
});

describe("budgetDay", () => {
  it("is the UTC date, the boundary the Workers AI budget resets on", () => {
    expect(budgetDay(new Date("2026-09-29T23:59:59Z"))).toBe("2026-09-29");
    expect(budgetDay(new Date("2026-09-30T00:00:00Z"))).toBe("2026-09-30");
  });
});
