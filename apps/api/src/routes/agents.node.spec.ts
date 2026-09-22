import { describe, expect, it } from "vitest";
import type { Env } from "../bindings.js";
import { isDailyBudgetExhausted, isRateLimited } from "./agents.js";

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
