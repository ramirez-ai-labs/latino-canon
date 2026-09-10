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

  it("lifts decade and country out of a natural phrase", async () => {
    const r = await rewriteQuery(brokenLlm, "Mexican family stories from the 90s");
    expect(r?.filters.decade).toBe(1990);
    expect(r?.filters.country).toBe("MX");
    expect(r?.source).toBe("rules");
    expect(r?.cleanedQuery.toLowerCase()).toContain("family");
    expect(r?.cleanedQuery).not.toMatch(/90s|mexican/i);
  });

  it("detects series intent", async () => {
    const r = await rewriteQuery(brokenLlm, "coming of age series about identity");
    expect(r?.filters.kind).toBe("series");
  });
});
