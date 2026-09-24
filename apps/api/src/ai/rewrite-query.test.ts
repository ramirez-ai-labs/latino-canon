import { describe, expect, it, vi } from "vitest";
import type { LlmClient, LlmResult } from "@latino-canon/core";
import { rewriteQuery } from "./rewrite-query.js";

// LLM that always throws → exercises the rules fallback path only.
const brokenLlm: LlmClient = {
  provider: "workers-ai",
  call: async () => {
    throw new Error("no budget");
  },
};

function workingLlm(json: object): { llm: LlmClient; callSpy: ReturnType<typeof vi.fn> } {
  const result: LlmResult = { text: JSON.stringify(json), model: "test-model", provider: "workers-ai", cached: false };
  const callSpy = vi.fn(async () => result);
  return { llm: { provider: "workers-ai", call: callSpy }, callSpy };
}

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

/**
 * Regression: the product advertises Spanish search on its own home page, but the
 * rules pass never extracts a theme filter in either language - a natural Spanish
 * phrase with no English connector word and no rules-extractable filter (no decade,
 * no "series"/"film") short-circuited to null before the LLM (which handles Spanish
 * fine per its own system prompt) ever got a chance to run. Found live: "peliculas de
 * inmigración y fronteras" returned an unranked 50-result dump with no interpretation
 * shown at all - confirming these tests need a working LLM mock, not the always-throws
 * one above, since the bug is specifically about whether the LLM gets *called*.
 */
describe("rewriteQuery (Spanish natural-language gate)", () => {
  it("still short-circuits a short keyword query without calling the LLM", async () => {
    const { llm, callSpy } = workingLlm({ cleanedQuery: "selena", filters: {}, rationale: "n/a" });
    const r = await rewriteQuery(llm, "selena");
    expect(r).toBeNull();
    expect(callSpy).not.toHaveBeenCalled();
  });

  it("calls the LLM for a natural Spanish phrase with no rules-extractable filter", async () => {
    const { llm, callSpy } = workingLlm({
      cleanedQuery: "immigration border",
      filters: { theme: "immigration" },
      rationale: "Spanish phrase about immigration and borders",
    });
    const r = await rewriteQuery(llm, "peliculas de inmigración y fronteras");
    expect(callSpy).toHaveBeenCalledTimes(1);
    expect(r?.source).toBe("llm");
    expect(r?.filters.theme).toBe("immigration");
  });

  it("calls the LLM for a shorter Spanish phrase carrying a recognized connector word", async () => {
    const { llm, callSpy } = workingLlm({ cleanedQuery: "love story", filters: {}, rationale: "n/a" });
    const r = await rewriteQuery(llm, "película de amor");
    expect(callSpy).toHaveBeenCalledTimes(1);
    expect(r?.source).toBe("llm");
  });
});

describe("rewriteQuery (genre keywords)", () => {
  it("lifts a genre from a short query the LLM gate would otherwise skip", async () => {
    const r = await rewriteQuery(brokenLlm, "kids cartoons");
    expect(r?.filters.genre).toBe("Animation");
    expect(r?.cleanedQuery).toBe("kids");
  });

  it("recognizes Spanish genre words, accented or not", async () => {
    expect((await rewriteQuery(brokenLlm, "películas animadas"))?.filters.genre).toBe("Animation");
    expect((await rewriteQuery(brokenLlm, "documentales de musica"))?.filters.genre).toBe("Documentary");
  });

  it("keeps the rules' genre when the LLM leaves it out", async () => {
    const { llm } = workingLlm({ cleanedQuery: "kids", filters: { contentAdvisory: "general" }, rationale: "n/a" });
    const r = await rewriteQuery(llm, "kids cartoons");
    expect(r?.source).toBe("llm");
    expect(r?.filters).toEqual({ contentAdvisory: "general", genre: "Animation" });
  });
});
