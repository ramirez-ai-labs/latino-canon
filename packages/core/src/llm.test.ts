import { describe, expect, it } from "vitest";
import { coerceLlmText } from "./llm.js";

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
