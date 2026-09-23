import { describe, expect, it } from "vitest";
import { primaryCreativeLead, type Credit } from "./types.js";

function credit(role: Credit["role"], name: string, gender: Credit["person"]["gender"] = null): Credit {
  return { person: { id: name, tmdbId: null, name, knownForDepartment: null, gender }, role, character: null, order: 0 };
}

/**
 * Regression: led_by's own definition is "a Latino director OR SHOWRUNNER held
 * primary creative control" - a series credited only with creators (never a formal
 * director role) still earns led_by, but the byline/gender lookup only checked
 * role === "director" and silently fell back to null. Found live on "The Ministry of
 * Time" (creator-only credits): the card showed "-" for its byline, and a female
 * showrunner with no director-role credit would have defaulted to "Latino-directed"
 * over "Latina-directed", since a null gender reads as male.
 */
describe("primaryCreativeLead", () => {
  it("prefers a director credit when one exists", () => {
    const credits = [credit("creator", "Creator Person"), credit("director", "Director Person")];
    expect(primaryCreativeLead(credits)?.person.name).toBe("Director Person");
  });

  it("falls back to the creator credit when no director is credited", () => {
    const credits = [credit("cast", "Lead Actor"), credit("creator", "Showrunner")];
    expect(primaryCreativeLead(credits)?.person.name).toBe("Showrunner");
  });

  it("returns null when neither a director nor a creator is credited", () => {
    expect(primaryCreativeLead([credit("cast", "Lead Actor")])).toBeNull();
  });

  it("carries the showrunner's gender through when falling back", () => {
    const credits = [credit("creator", "Showrunner", "female")];
    expect(primaryCreativeLead(credits)?.person.gender).toBe("female");
  });
});
