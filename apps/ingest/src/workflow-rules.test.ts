import { describe, expect, it } from "vitest";
import { confidentThemes, isYearMismatch, jobIdFor, needsHumanReview } from "./workflow-rules.js";

describe("jobIdFor", () => {
  it("slugifies a title ref into a stable job id", () => {
    expect(jobIdFor("El Chavo del 8 (1973)")).toBe("job_el_chavo_del_8_1973_");
  });

  it("collapses runs of non-word characters", () => {
    expect(jobIdFor("Once Upon a Time... in Mexico! (2003)")).toBe("job_once_upon_a_time_in_mexico_2003_");
  });
});

describe("isYearMismatch", () => {
  it("catches a pinned id pointing at an unrelated title: El Chavo del 8 (1973) -> Firefly (2002)", () => {
    expect(isYearMismatch(1973, 2002)).toBe(true);
  });

  it("catches a search match on a namesake: Los olvidados (1950) -> a 2014 film", () => {
    expect(isYearMismatch(1950, 2014)).toBe(true);
  });

  it("tolerates a small gap (festival premiere vs release, awards-year imprecision)", () => {
    expect(isYearMismatch(1973, 1974)).toBe(false);
    expect(isYearMismatch(1973, 1975)).toBe(false);
  });

  it("flags just past the tolerance boundary", () => {
    expect(isYearMismatch(1973, 1976)).toBe(true);
  });

  it("is symmetric - resolving to something earlier than expected is just as wrong", () => {
    expect(isYearMismatch(1977, 1910)).toBe(true); // Manuel Rodríguez
  });
});

describe("needsHumanReview", () => {
  it("does not flag a title with any seed-sourced inclusion type, regardless of model confidence", () => {
    // The exact real incident: El Chavo del 8 and The Dead Girls both had real
    // seedInclusionTypes but the model returned zero/low confidence, and the old
    // logic ignored seed trust entirely.
    expect(needsHumanReview(["led_by", "created_by"], [])).toBe(false);
    expect(needsHumanReview(["led_by"], [{ type: "starring", confidence: 0.1 }])).toBe(false);
  });

  it("flags a title with no seed tags and no model inclusion types at all", () => {
    expect(needsHumanReview([], [])).toBe(true);
    expect(needsHumanReview(undefined, [])).toBe(true);
  });

  it("flags a title with no seed tags where every model tag is below the display threshold", () => {
    expect(needsHumanReview([], [{ type: "starring", confidence: 0.5 }])).toBe(true);
  });

  it("does not flag a title with no seed tags but at least one confident model tag", () => {
    expect(needsHumanReview([], [{ type: "led_by", confidence: 0.6 }])).toBe(false);
    expect(needsHumanReview([], [{ type: "starring", confidence: 0.1 }, { type: "led_by", confidence: 0.9 }])).toBe(
      false,
    );
  });
});

describe("confidentThemes", () => {
  it("keeps only themes at or above the display threshold", () => {
    expect(
      confidentThemes([
        { theme: "family", confidence: 0.9 },
        { theme: "faith", confidence: 0.3 },
        { theme: "music", confidence: 0.6 },
      ]),
    ).toEqual(["family", "music"]);
  });

  it("treats a missing themes array as none", () => {
    expect(confidentThemes(undefined)).toEqual([]);
  });
});
