import { describe, expect, it } from "vitest";
import type { LlmClient } from "@latino-canon/core";
import { rewriteQuery } from "./rewrite-query.js";

// LLM that always throws → exercises the rules fallback path only.
const brokenLlm: LlmClient = {
  provider: "workers-ai",
  call: async () => {
    throw new Error("no budget");
  },
};

describe("rewriteQuery (rules fallback)", () => {
  it("returns null for short keyword queries", async () => {
    expect(await rewriteQuery(brokenLlm, "selena")).toBeNull();
  });

  it("lifts a decade out of a natural phrase", async () => {
    const r = await rewriteQuery(brokenLlm, "Mexican family stories from the 90s");
    expect(r?.filters.decade).toBe(1990);
    expect(r?.source).toBe("rules");
    expect(r?.cleanedQuery.toLowerCase()).toContain("family");
    expect(r?.cleanedQuery).not.toMatch(/90s/i);
  });

  // Regression: this used to also lift filters.country = "MX" from "Mexican" - wrong for
  // a catalog of overwhelmingly US-produced stories about other-country heritage, and it
  // broke this exact live query (My Family is US-produced) by filtering out its own
  // right answer before ranking ever ran.
  it("does not turn a nationality/heritage word into a country filter", async () => {
    const r = await rewriteQuery(brokenLlm, "Mexican family stories from the 90s");
    expect(r?.filters.country).toBeUndefined();
    expect(r?.cleanedQuery.toLowerCase()).toContain("mexican");

    const r2 = await rewriteQuery(brokenLlm, "Latina showrunner sitcom about a Cuban-American family");
    expect(r2?.filters.country).toBeUndefined();
  });

  it("detects series intent", async () => {
    const r = await rewriteQuery(brokenLlm, "coming of age series about identity");
    expect(r?.filters.kind).toBe("series");
  });
});
