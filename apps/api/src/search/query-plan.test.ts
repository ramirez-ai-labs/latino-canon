import { describe, expect, it } from "vitest";
import { isFillerQuery, relaxedFilterSets } from "./query-plan.js";

describe("isFillerQuery", () => {
  it("treats a bare 'a title' word as filler, in English and Spanish", () => {
    expect(isFillerQuery("films")).toBe(true);
    expect(isFillerQuery("movies")).toBe(true);
    expect(isFillerQuery("películas")).toBe(true);
    expect(isFillerQuery("the series")).toBe(true);
    expect(isFillerQuery("")).toBe(true);
  });

  it("keeps anything that names a plot, person, or title", () => {
    expect(isFillerQuery("films about family")).toBe(false);
    expect(isFillerQuery("Selena")).toBe(false);
    expect(isFillerQuery("kids")).toBe(false);
  });
});

describe("relaxedFilterSets", () => {
  it("drops the least trustworthy inferred filter first, keeping genre longest", () => {
    const sets = relaxedFilterSets({ kind: "film", country: "MX", genre: "Animation" }, {});
    expect(sets).toEqual([{ kind: "film", genre: "Animation" }, { genre: "Animation" }, {}]);
  });

  it("never drops a filter the caller chose explicitly", () => {
    const sets = relaxedFilterSets({ country: "MX", genre: "Animation", decade: 2010 }, { decade: 2010 });
    expect(sets).toEqual([{ genre: "Animation", decade: 2010 }, { decade: 2010 }]);
  });

  it("has nothing to retry when every filter is explicit", () => {
    expect(relaxedFilterSets({ genre: "Animation" }, { genre: "Animation" })).toEqual([]);
  });
});
