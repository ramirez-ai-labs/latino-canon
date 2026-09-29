import { describe, expect, it } from "vitest";
import {
  coerceLlmText,
  escapeInnerQuotes,
  extractJson,
  normalizeBlurbJson,
  normalizeClassificationJson,
  normalizeContentAdvisoryJson,
} from "./llm.js";

describe("extractJson", () => {
  // The actual bug this guards: the Crónicas (2004) blurb reply quoted the synopsis's
  // "Monster of Babahoyo." without escaping, JSON.parse threw at the inner quote, and the
  // title went live without a blurb.
  const cronicas =
    '{"text": "Crónicas (2004) follows a Miami reporter who travels to Ecuador after a serial killer known as the "Monster of Babahoyo." [s1] It is directed by Sebastián Cordero [d0].", "claims": [{"claim": "known as the "Monster of Babahoyo."", "supportedBy": "s1"}, {"claim": "directed by Sebastián Cordero", "supportedBy": "d0"}]}';

  it("repairs unescaped quotes inside a string value", () => {
    const out = extractJson(cronicas) as { text: string; claims: { claim: string; supportedBy: string }[] };
    expect(out.text).toContain('known as the "Monster of Babahoyo." [s1]');
    expect(out.claims).toEqual([
      { claim: 'known as the "Monster of Babahoyo."', supportedBy: "s1" },
      { claim: "directed by Sebastián Cordero", supportedBy: "d0" },
    ]);
  });

  it("keeps a quote followed by a comma in prose inside the string", () => {
    const out = extractJson('{"text": "the "Tigre", a boxer, returns [s1].", "claims": []}') as { text: string };
    expect(out.text).toBe('the "Tigre", a boxer, returns [s1].');
  });

  it("still parses well-formed and fenced replies unchanged", () => {
    expect(extractJson('```json\n{"text": "a \\"quoted\\" word", "n": 1}\n```')).toEqual({ text: 'a "quoted" word', n: 1 });
  });

  it("throws the original parse error when the repair can't help", () => {
    expect(() => extractJson('{"text": "cut off')).toThrow();
    // A trailing comma isn't a quoting problem, so the repair changes nothing.
    expect(() => extractJson('{"text": "a", }')).toThrow(/JSON|Expected|Unexpected/);
  });
});

describe("escapeInnerQuotes", () => {
  it("leaves valid JSON untouched", () => {
    const valid = '{"a": "x", "b": ["y", "z"], "c": {"d": "\\"e\\""}}';
    expect(escapeInnerQuotes(valid)).toBe(valid);
  });
});

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

describe("normalizeBlurbJson", () => {
  // The actual bug this guards: tightening the blurb prompt to fix a too-short "text"
  // (a prior fix) made Workers AI consistently overshoot the *other* end instead - live,
  // 6 titles in a row all failed with "text" over the 360-character max after that
  // change. Truncating deterministically holds regardless of which way the model's
  // wording drifts next.
  it("leaves text under the max unchanged", () => {
    const out = normalizeBlurbJson({ text: "Short and grounded.", claims: [] }) as { text: string };
    expect(out.text).toBe("Short and grounded.");
  });

  it("truncates overlong text at the last complete sentence within the limit", () => {
    const first = "A".repeat(300) + ".";
    const second = " " + "B".repeat(100) + ".";
    const out = normalizeBlurbJson({ text: first + second, claims: [] }) as { text: string };
    expect(out.text).toBe(first);
    expect(out.text.length).toBeLessThanOrEqual(360);
  });

  it("falls back to an ellipsis cut when there's no sentence boundary within the limit", () => {
    const noPunctuation = "A".repeat(400);
    const out = normalizeBlurbJson({ text: noPunctuation, claims: [] }) as { text: string };
    expect(out.text.length).toBeLessThanOrEqual(360);
    expect(out.text.endsWith("…")).toBe(true);
  });

  it("passes through fields other than text untouched", () => {
    const claims = [{ claim: "x", supportedBy: "s1" }];
    const out = normalizeBlurbJson({ text: "A".repeat(400) + ".", claims }) as { claims: unknown };
    expect(out.claims).toBe(claims);
  });
});

describe("normalizeContentAdvisoryJson", () => {
  // Same casing-drift class of bug normalizeClassificationJson guards against
  // (e.g. a live classify call returning "Family" instead of "family") - this field
  // is just as exposed to it since it's model output, not user input.
  it("lowercases rating casing drift", () => {
    const out = normalizeContentAdvisoryJson({ rating: "General", rationale: "n/a" }) as { rating: string };
    expect(out.rating).toBe("general");
  });

  it("trims whitespace", () => {
    const out = normalizeContentAdvisoryJson({ rating: " mature ", rationale: "n/a" }) as { rating: string };
    expect(out.rating).toBe("mature");
  });

  it("passes through unchanged when rating isn't a string", () => {
    const raw = { rating: null, rationale: "n/a" };
    expect(normalizeContentAdvisoryJson(raw)).toBe(raw);
  });
});
