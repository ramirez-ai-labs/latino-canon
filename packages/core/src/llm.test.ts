import { describe, expect, it } from "vitest";
import { coerceLlmText, normalizeClassificationJson } from "./llm.js";

describe("coerceLlmText", () => {
  it("passes a string through unchanged", () => {
    expect(coerceLlmText('{"text":"hi"}')).toBe('{"text":"hi"}');
  });

  it("stringifies an already-parsed object instead of throwing downstream", () => {
    // The actual bug this guards: Workers AI returned a parsed object under `response`
    // for one completion (a blurb call) but a string for another (a classify call) on
    // the same model — extractJson's text.match(...) blew up on the object.
    expect(coerceLlmText({ text: "hi" })).toBe('{"text":"hi"}');
  });

  it("treats null/undefined as empty rather than throwing", () => {
    expect(coerceLlmText(null)).toBe("");
    expect(coerceLlmText(undefined)).toBe("");
  });
});

describe("normalizeClassificationJson", () => {
  // The actual bug this guards: a live classify call against Workers AI returned
  // `theme: "Family"` / `"Identity"` (wrong case) and `theme: "education"` (not in the
  // taxonomy at all) - all three failed classificationSchema's enum check and errored
  // the whole ingest job.
  it("lowercases theme/inclusion-type casing drift", () => {
    const out = normalizeClassificationJson({
      inclusionTypes: [{ type: "Led_By", confidence: 0.9 }],
      themes: [{ theme: "Family", confidence: 0.8 }],
    }) as { inclusionTypes: { type: string }[]; themes: { theme: string }[] };
    expect(out.inclusionTypes[0]?.type).toBe("led_by");
    expect(out.themes[0]?.theme).toBe("family");
  });

  it("drops themes/inclusion types that aren't in the taxonomy instead of throwing", () => {
    const out = normalizeClassificationJson({
      inclusionTypes: [],
      themes: [
        { theme: "education", confidence: 0.7 },
        { theme: "Identity", confidence: 0.6 },
      ],
    }) as { themes: { theme: string }[] };
    expect(out.themes).toHaveLength(1);
    expect(out.themes[0]?.theme).toBe("identity");
  });

  // Also seen live: a classify call sent `note: null` instead of omitting the key,
  // which z.string().optional() rejects (it only accepts undefined).
  it("turns a null note into undefined", () => {
    const out = normalizeClassificationJson({ inclusionTypes: [], themes: [], note: null }) as {
      note: unknown;
    };
    expect(out.note).toBeUndefined();
  });
});
