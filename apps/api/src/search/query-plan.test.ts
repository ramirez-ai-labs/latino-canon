import { describe, expect, it } from "vitest";
import { BOOST_PER_MATCH, countFacetMatches, isFillerQuery, relaxedFilterSets, rerankWithBoosts } from "./query-plan.js";

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

describe("countFacetMatches", () => {
  const facets = {
    kind: "film",
    yearStart: 2014,
    countries: ["US"],
    genres: ["Animation", "Family"],
    contentAdvisory: "general",
    tags: ["theme:family", "inclusion_type:created_by"],
  };

  it("counts each inferred filter the title satisfies", () => {
    expect(countFacetMatches(facets, { genre: "Animation", decade: 2010, theme: "family", inclusionType: "created_by" })).toBe(4);
  });

  it("counts nothing for wrong guesses", () => {
    expect(countFacetMatches(facets, { genre: "Music", kind: "series", country: "MX", theme: "borderlands" })).toBe(0);
  });
});

describe("rerankWithBoosts", () => {
  const hits = Array.from({ length: 12 }, (_, i) => ({ titleId: `t${i}` }));

  it("lifts a boosted title several places, but not past the text's best match from ten down", () => {
    const ranked = rerankWithBoosts(hits, (id) => (id === "t10" ? 1 : 0)).map((h) => h.titleId);
    expect(ranked.indexOf("t10")).toBeGreaterThan(0);
    expect(ranked.indexOf("t10")).toBeLessThan(10);
    expect(ranked[0]).toBe("t0");
    // One match is worth less than ten rank positions near the top.
    expect(BOOST_PER_MATCH).toBeLessThan(1 / 61 - 1 / 71);
  });
});
