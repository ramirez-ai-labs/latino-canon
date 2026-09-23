import { describe, expect, it, vi } from "vitest";
import type { LlmClient, LlmResult, TitleCard } from "@latino-canon/core";
import { extractIntent, rerankedResults, scoreTone } from "./tools.js";

/** Returns the spy as a bare variable, not `llm.call`, so assertions never trip
 * @typescript-eslint/unbound-method (a member-access reference, not a plain function
 * value like this project's other mocks - see hybrid.node.spec.ts's vi.hoisted). */
function fakeLlm(text: string): { llm: LlmClient; callSpy: ReturnType<typeof vi.fn> } {
  const callSpy = vi.fn<() => Promise<LlmResult>>().mockResolvedValue({
    text,
    model: "test-model",
    provider: "workers-ai",
    cached: false,
  });
  return { llm: { provider: "workers-ai", call: callSpy }, callSpy };
}

function card(overrides: Partial<TitleCard> = {}): TitleCard {
  return {
    id: "test-2020",
    kind: "film",
    title: "Test",
    yearStart: 2020,
    yearEnd: null,
    director: null,
    directorGender: null,
    posterKey: null,
    blurbTeaser: "A test film.",
    inclusionTypes: [],
    inclusionTypesWithConfidence: [],
    themes: [],
    score: 0,
    representationHandling: null,
    runtime: null,
    oscarWin: null,
    ...overrides,
  };
}

describe("extractIntent", () => {
  it("skips the LLM entirely for a query with no natural-language cue and nothing a rule can extract", async () => {
    // rewriteQuery's own skip condition (ai/rewrite-query.ts): only true when the
    // phrase doesn't "look natural" AND its rules pass found nothing at all - a real,
    // if narrow, no-AI-call case worth confirming actually fires.
    const { llm, callSpy } = fakeLlm("{}");
    const intent = await extractIntent(llm, "xyz");
    expect(intent.source).toBe("none");
    expect(intent.cleanedQuery).toBe("xyz");
    expect(callSpy).not.toHaveBeenCalled();
  });

  it("uses the LLM's structured extraction (theme/decade/kind) when the call succeeds", async () => {
    const { llm, callSpy } = fakeLlm(
      '{"cleanedQuery":"films","filters":{"decade":1990,"kind":"film","theme":"identity"},"rationale":"test"}',
    );
    const intent = await extractIntent(llm, "90s films about identity");
    expect(intent.decade).toBe(1990);
    expect(intent.kind).toBe("film");
    expect(intent.theme).toBe("identity");
    expect(intent.source).toBe("llm");
    expect(callSpy).toHaveBeenCalledWith(expect.objectContaining({ task: "query-rewrite", caller: "agents.curate" }));
  });

  it("falls back to rewriteQuery's own rules result when the LLM call fails - decade/kind still come through", async () => {
    const callSpy = vi.fn<() => Promise<LlmResult>>().mockRejectedValue(new Error("no budget"));
    const llm: LlmClient = { provider: "workers-ai", call: callSpy };
    const intent = await extractIntent(llm, "90s films");
    expect(intent.decade).toBe(1990);
    expect(intent.kind).toBe("film");
    expect(intent.source).toBe("rules");
  });

  it("detects directorGender from an explicit phrase independent of whichever rewriteQuery path ran", async () => {
    const { llm } = fakeLlm('{"cleanedQuery":"films from the 90s","filters":{"decade":1990},"rationale":"test"}');
    const intent = await extractIntent(llm, "films from the 90s directed by women");
    expect(intent.directorGender).toBe("female");
  });

  it("detects tone keywords via regex, never via an AI call", async () => {
    const { llm } = fakeLlm("{}");
    const lighter = await extractIntent(llm, "something lighter and fun");
    expect(lighter.tone).toBe("lighter");
    const heavier = await extractIntent(llm, "a heavier, dark drama");
    expect(heavier.tone).toBe("heavier");
  });
});

describe("scoreTone", () => {
  it("sizes maxTokens to the batch instead of a flat guess", async () => {
    const { llm, callSpy } = fakeLlm('{"a-2020": 0.9}');
    await scoreTone(llm, [card({ id: "a-2020" })], "lighter");
    expect(callSpy).toHaveBeenCalledWith(
      expect.objectContaining({ task: "judge", caller: "agents.curate", maxTokens: 100 }), // 80 + 1*20
    );
  });

  it("returns an empty map (not a throw) on malformed JSON", async () => {
    const { llm } = fakeLlm("not json");
    const scores = await scoreTone(llm, [card()], "lighter");
    expect(scores.size).toBe(0);
  });

  it("returns an empty map immediately for an empty candidate list, without calling the LLM", async () => {
    const { llm, callSpy } = fakeLlm("{}");
    const scores = await scoreTone(llm, [], "lighter");
    expect(scores.size).toBe(0);
    expect(callSpy).not.toHaveBeenCalled();
  });
});

describe("rerankedResults", () => {
  it("scores a real directorGender match - the bug this replaces silently ignored this entirely", () => {
    const target = card({ id: "target-2020", directorGender: "female" });
    const other = card({ id: "other-2020", directorGender: "male" });
    const ranked = rerankedResults([other, target], { directorGender: "female", cleanedQuery: "q", source: "none" }, 5);
    expect(ranked[0]?.title.id).toBe("target-2020");
    expect(ranked[0]?.matchedCriteria).toContain("director: female");
  });

  it("penalizes a confirmed director-gender mismatch instead of treating it as neutral - found live", () => {
    // Reproduces the exact live bug: "female director" query returned two
    // male-directed films ranked above the one film that actually had a female
    // director, because theme+decade+kind (0.3+0.2+0.15=0.65) outweighed
    // decade+kind+directorGender (0.2+0.15+0.2=0.55) under the old additive-only
    // scoring - a known male director and an unknown director scored identically.
    const wrongGenderStrongMatch = card({
      id: "wrong-gender-2020",
      directorGender: "male",
      themes: ["coming_of_age"],
      yearStart: 1995,
    });
    const rightGenderWeakMatch = card({ id: "right-gender-2020", directorGender: "female", yearStart: 1994 });
    const intent = { theme: "coming_of_age" as const, decade: 1990, directorGender: "female" as const, cleanedQuery: "q", source: "none" as const };

    const ranked = rerankedResults([wrongGenderStrongMatch, rightGenderWeakMatch], intent, 5);

    expect(ranked[0]?.title.id).toBe("right-gender-2020");
    expect(ranked[0]?.matchedCriteria).toContain("director: female");
    expect(ranked[1]?.title.id).toBe("wrong-gender-2020");
    expect(ranked[1]?.matchedCriteria).not.toContain("director: female");
  });

  it("doesn't penalize an unknown director gender the same as a confirmed mismatch", () => {
    const unknownGender = card({ id: "unknown-2020", directorGender: null, themes: ["coming_of_age"] });
    const confirmedWrong = card({ id: "wrong-2020", directorGender: "male", themes: ["coming_of_age"] });
    const intent = { theme: "coming_of_age" as const, directorGender: "female" as const, cleanedQuery: "q", source: "none" as const };

    const ranked = rerankedResults([confirmedWrong, unknownGender], intent, 5);

    // Same theme match for both, so a known-wrong director should rank strictly
    // below one where the director's gender simply isn't known.
    expect(ranked[0]?.title.id).toBe("unknown-2020");
    expect(ranked[1]?.title.id).toBe("wrong-2020");
  });

  it("respects the caller's limit instead of a hardcoded 5", () => {
    const titles = Array.from({ length: 8 }, (_, i) => card({ id: `t${i}`, score: 1 - i * 0.1 }));
    const ranked = rerankedResults(titles, { cleanedQuery: "q", source: "none" }, 3);
    expect(ranked).toHaveLength(3);
  });

  it("only credits a theme match when the title actually carries that theme", () => {
    const withTheme = card({ id: "with-2020", themes: ["identity"] });
    const withoutTheme = card({ id: "without-2020", themes: ["family"] });
    const ranked = rerankedResults([withoutTheme, withTheme], { theme: "identity", cleanedQuery: "q", source: "none" }, 5);
    expect(ranked[0]?.title.id).toBe("with-2020");
    expect(ranked[0]?.matchedCriteria).toContain("theme: identity");
  });
});
