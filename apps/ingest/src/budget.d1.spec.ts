import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "./bindings.js";
import { claimBudget, claimsToday, recordIngestRun } from "./budget.js";

// Real D1 with migration 0029. Each test uses its own day so the ledger rows don't overlap.
const testEnv = env as unknown as Env;

describe("the budget ledger (ai_budget_claims)", () => {
  it("grants the first optional job, records it, and refuses a different one the same day", async () => {
    const day = "2026-10-01";
    expect(await claimBudget(testEnv, "eval-mcp-tools", false, undefined, day)).toEqual({ allow: true, override: false });
    const second = await claimBudget(testEnv, "eval-groundedness", false, undefined, day);
    expect(second.allow).toBe(false);
    expect((await claimsToday(testEnv, day)).map((c) => c.kind)).toEqual(["eval-mcp-tools"]);
  });

  it("lets the same job claim again without a second row", async () => {
    const day = "2026-10-02";
    await claimBudget(testEnv, "blurb-regen", false, undefined, day);
    expect((await claimBudget(testEnv, "blurb-regen", false, undefined, day)).allow).toBe(true);
    expect(await claimsToday(testEnv, day)).toHaveLength(1);
  });

  it("refuses an optional job after the queue recorded an ingest day", async () => {
    const day = "2026-10-03";
    await recordIngestRun(testEnv, "ingest-queue", day);
    await recordIngestRun(testEnv, "ingest-queue", day); // idempotent
    expect((await claimBudget(testEnv, "eval-groundedness", false, undefined, day)).allow).toBe(false);
    expect((await claimsToday(testEnv, day)).map((c) => c.kind)).toEqual(["ingest-queue"]);
  });

  it("records an override with its reason, so the exception is auditable", async () => {
    const day = "2026-10-04";
    await recordIngestRun(testEnv, "ingest-manual", day);
    const d = await claimBudget(testEnv, "eval-groundedness", false, "baseline before the summit talk", day);
    expect(d).toEqual({ allow: true, override: true });
    const row = (await claimsToday(testEnv, day)).find((c) => c.kind === "eval-groundedness");
    expect(row).toMatchObject({ override: 1, reason: "baseline before the summit talk" });
  });
});
