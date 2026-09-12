import { describe, expect, it } from "vitest";
import { filterToSql, filterToVectorize, needsD1PostFilter } from "./filters.js";

describe("filterToSql", () => {
  // The actual bug this guards: lexicalSearch embeds this WHERE fragment after its own
  // `titles_fts MATCH ?1`, but filterToSql numbered its placeholders from ?1 too - so a
  // filter combined with a text query silently compared against the MATCH string
  // instead of the filter value, and always returned zero rows. Confirmed live: any
  // text query + any filter (country/theme/decade) returned empty results even though
  // each alone worked.
  it("offsets placeholders past ones the caller already bound", () => {
    const { where, params } = filterToSql({ country: "MX" }, "t", 1);
    expect(where).toContain("?2");
    expect(where).not.toContain("?1");
    expect(params).toEqual(["MX"]);
  });

  it("numbers placeholders from ?1 with no offset", () => {
    const { where, params } = filterToSql({ country: "MX" });
    expect(where).toContain("?1");
    expect(params).toEqual(["MX"]);
  });

  // Second bug this guards: decade computed both BETWEEN bounds via the same
  // placeholder-numbering call before either value was pushed, so both bounds got the
  // same number (`BETWEEN ?1 AND ?1`) and only the exact start year ever matched.
  it("gives the decade BETWEEN clause two distinct, consecutive placeholders", () => {
    const { where, params } = filterToSql({ decade: 1990 });
    expect(where).toContain("BETWEEN ?1 AND ?2");
    expect(params).toEqual([1990, 1999]);
  });

  it("assigns each filter its own placeholder in combination, in order", () => {
    const { where, params } = filterToSql({ kind: "film", decade: 1990, country: "MX" }, "t", 1);
    expect(where).toContain("?2"); // kind
    expect(where).toContain("BETWEEN ?3 AND ?4"); // decade
    expect(where).toContain("?5"); // country
    expect(params).toEqual(["film", 1990, 1999, "MX"]);
  });
});

describe("filterToVectorize", () => {
  // The actual bug this guards: countries/themes/inclusionTypes are stored as arrays in
  // Vectorize metadata (a title can have more than one of each), but Vectorize metadata
  // values must be a scalar - there's no "array contains" filter operator. `{ $eq: "MX" }"`
  // against an array-valued field never matches, so semantic search + any of these three
  // filters always returned zero results, confirmed live against the deployed API.
  it("only pushes down kind and decade, the two scalar-valued filters", () => {
    const f = filterToVectorize({ kind: "film", decade: 1990, country: "MX", theme: "family", inclusionType: "led_by" });
    expect(f).toEqual({ kind: "film", decade: 1990 });
  });

  it("omits keys entirely for unset filters", () => {
    expect(filterToVectorize({})).toEqual({});
  });
});

describe("needsD1PostFilter", () => {
  it("is true when country, theme, or inclusionType is set", () => {
    expect(needsD1PostFilter({ country: "MX" })).toBe(true);
    expect(needsD1PostFilter({ theme: "family" })).toBe(true);
    expect(needsD1PostFilter({ inclusionType: "led_by" })).toBe(true);
  });

  it("is false when only kind/decade (or nothing) is set", () => {
    expect(needsD1PostFilter({})).toBe(false);
    expect(needsD1PostFilter({ kind: "film", decade: 1990 })).toBe(false);
  });
});
