import { describe, expect, it } from "vitest";
import type { Env } from "../bindings.js";
import { claimV2Slot, isDailyBudgetExhausted, isRateLimited, selectedAgent, V2_DAILY_CAP } from "./agents.js";

/** In-memory stand-in for the KV namespace - real get/put semantics, no bindings. */
function fakeCache(): { CACHE: Env["CACHE"] } {
  const store = new Map<string, string>();
  return {
    CACHE: {
      get: (async (key: string) => store.get(key) ?? null) as Env["CACHE"]["get"],
      put: (async (key: string, value: string) => {
        store.set(key, value);
      }) as Env["CACHE"]["put"],
    } as Env["CACHE"],
  };
}

describe("isRateLimited", () => {
  it("allows requests under the per-minute cap and blocks the one that exceeds it", async () => {
    const env = fakeCache() as Env;
    for (let i = 0; i < 10; i++) {
      expect(await isRateLimited(env, "1.2.3.4")).toBe(false);
    }
    expect(await isRateLimited(env, "1.2.3.4")).toBe(true);
  });

  it("tracks each IP independently", async () => {
    const env = fakeCache() as Env;
    for (let i = 0; i < 10; i++) await isRateLimited(env, "1.1.1.1");
    expect(await isRateLimited(env, "1.1.1.1")).toBe(true);
    expect(await isRateLimited(env, "2.2.2.2")).toBe(false);
  });
});

describe("isDailyBudgetExhausted", () => {
  it("allows requests under the daily cap and blocks once it's hit - account-wide, not per-IP", async () => {
    const env = fakeCache() as Env;
    for (let i = 0; i < 200; i++) {
      expect(await isDailyBudgetExhausted(env)).toBe(false);
    }
    expect(await isDailyBudgetExhausted(env)).toBe(true);
  });
});

describe("the v2 agent switch and its daily cap", () => {
  it("answers with v1 unless CURATE_AGENT is exactly v2 - the ship gate decides the default", () => {
    expect(selectedAgent({} as Env)).toBe("v1");
    expect(selectedAgent({ CURATE_AGENT: "v1" } as Env)).toBe("v1");
    expect(selectedAgent({ CURATE_AGENT: "V2" } as Env)).toBe("v1");
    expect(selectedAgent({ CURATE_AGENT: "v2" } as Env)).toBe("v2");
  });

  // ~180 neurons a v2 request: ten a day is ~1.8k, against the account's 10k.
  it("grants ten v2 requests a day, then refuses so v1 answers", async () => {
    const env = fakeCache() as Env;
    for (let i = 0; i < V2_DAILY_CAP; i++) expect(await claimV2Slot(env)).toBe(true);
    expect(await claimV2Slot(env)).toBe(false);
  });
});
