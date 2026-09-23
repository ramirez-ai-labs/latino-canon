import { describe, expect, it } from "vitest";
import { detectDirectorGender, detectLeadGender, detectTone, isComplexQuery } from "./query-signals.js";

/**
 * Regression for a live bug: apps/web's search page kept its own copy of these
 * regexes for routing decisions (plain /search vs the gender-aware /agents/curate),
 * and that copy never picked up leadGender when it was added on the backend. A query
 * like "female lead with a female director coming of age 90s" fell through to plain
 * /search - which has no directorGender/leadGender field at all - and surfaced three
 * male-directed, male-led results despite asking for both explicitly. Both sides now
 * import the same functions from here, so they can't drift apart again.
 */
describe("isComplexQuery", () => {
  it("routes on 'female lead' alone - the exact signal the web app's stale copy missed", () => {
    expect(isComplexQuery("female lead coming of age story")).toBe(true);
  });

  it("routes on 'lead actress'", () => {
    expect(isComplexQuery("movies with a lead actress from the 90s")).toBe(true);
  });

  it("routes on 'female director' alone", () => {
    expect(isComplexQuery("films made by women directors")).toBe(true);
  });

  it("routes when both director and lead gender are named together", () => {
    expect(isComplexQuery("female lead with a female director coming of age 90s")).toBe(true);
  });

  it("routes on tone words", () => {
    expect(isComplexQuery("something lighter and fun")).toBe(true);
  });

  it("does not route a plain query with none of these signals", () => {
    expect(isComplexQuery("mexican family drama")).toBe(false);
  });

  it("does not treat 'lead actor' as a signal - used gender-neutrally today, unlike 'lead actress'", () => {
    expect(isComplexQuery("movie with a strong lead actor")).toBe(false);
  });
});

describe("detectLeadGender", () => {
  it("detects female from 'female lead'", () => {
    expect(detectLeadGender("a story with a female lead")).toBe("female");
  });

  it("detects male from 'male lead'", () => {
    expect(detectLeadGender("a story with a male lead")).toBe("male");
  });

  it("returns undefined for 'lead actor' (deliberately not a male signal)", () => {
    expect(detectLeadGender("a film with a great lead actor")).toBeUndefined();
  });
});

describe("detectDirectorGender and detectTone", () => {
  it("detects director gender independently of lead gender", () => {
    expect(detectDirectorGender("female director with a female lead")).toBe("female");
    expect(detectLeadGender("female director with a female lead")).toBe("female");
  });

  it("detects tone", () => {
    expect(detectTone("something dark and serious")).toBe("heavier");
    expect(detectTone("something fun and uplifting")).toBe("lighter");
  });
});
