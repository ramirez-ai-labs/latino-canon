import { describe, expect, it } from "vitest";
import { CANON_COUNTRIES, countryOptions, decadeOptions, parseReleaseRange, releaseOptions } from "./facets.js";

describe("countryOptions", () => {
  it("names countries in English and sorts them A-Z by name, not by code or count", () => {
    const opts = countryOptions([
      { code: "US", count: 120 },
      { code: "MX", count: 60 },
      { code: "ES", count: 20 },
      { code: "BO", count: 5 },
      { code: "PY", count: 5 },
      { code: "CR", count: 6 },
      { code: "PE", count: 9 },
    ]);
    expect(opts.map((o) => o.label)).toEqual(["Bolivia", "Costa Rica", "Mexico", "Paraguay", "Peru", "Spain", "United States"]);
    expect(opts.find((o) => o.value === "BO")).toEqual({ value: "BO", label: "Bolivia", count: 5 });
  });

  it("sorts accented and multi-word names the way a reader expects", () => {
    const labels = countryOptions([
      { code: "SV", count: 1 },
      { code: "DO", count: 1 },
      { code: "EC", count: 1 },
      { code: "PR", count: 1 },
    ]).map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    expect(labels).toContain("Dominican Republic");
    expect(labels).toContain("El Salvador");
  });

  it("offers only the canon's countries - the US, Spain and Latin America - not co-producers", () => {
    // The live dropdown after #300 listed every TMDB co-producing country.
    const opts = countryOptions([
      { code: "MX", count: 58 },
      { code: "FR", count: 12 },
      { code: "QA", count: 1 },
      { code: "HK", count: 1 },
      { code: "ZA", count: 1 },
      { code: "HT", count: 1 }, // Haiti: out of scope per CRITERIA.md
      { code: "PR", count: 4 },
      { code: "BR", count: 20 },
    ]);
    expect(opts.map((o) => o.value)).toEqual(["BR", "MX", "PR"]);
  });

  it("keeps every in-scope country the catalog has", () => {
    const all = CANON_COUNTRIES.map((code) => ({ code, count: 1 }));
    expect(countryOptions(all)).toHaveLength(CANON_COUNTRIES.length);
    expect(CANON_COUNTRIES).toHaveLength(22);
  });

  it("keeps a code Intl can't name as its own label instead of dropping it", () => {
    expect(countryOptions([{ code: "ZZ", count: 1 }], "en", ["ZZ"])[0]!.value).toBe("ZZ");
  });
});

describe("decadeOptions", () => {
  it("lists decades oldest first, including the ones the old hard-coded list left out", () => {
    const opts = decadeOptions([
      { decade: 2010, count: 90 },
      { decade: 1930, count: 1 },
      { decade: 1950, count: 3 },
      { decade: 1990, count: 30 },
    ]);
    expect(opts.map((o) => o.label)).toEqual(["1930s", "1950s", "1990s", "2010s"]);
    expect(opts[0]).toEqual({ value: "1930", label: "1930s", count: 1 });
  });
});

describe("releaseOptions", () => {
  // The live catalog on 2026-10-20, 2015 onward plus a few older decades.
  const years = [
    { year: 1931, count: 1 },
    { year: 1959, count: 2 },
    { year: 1950, count: 3 },
    { year: 2017, count: 20 },
    { year: 2019, count: 17 },
    { year: 2022, count: 10 },
    { year: 2024, count: 10 },
    { year: 2025, count: 39 },
    { year: 2026, count: 56 },
  ];

  it("splits the busy newest years off their decade and keeps the rest as one range, newest first", () => {
    expect(releaseOptions(years)).toEqual([
      { value: "2026-2026", label: "2026", count: 56 },
      { value: "2025-2025", label: "2025", count: 39 },
      { value: "2020-2024", label: "2020\u20132024", count: 20 },
      { value: "2010-2019", label: "2010s", count: 37 },
      { value: "1950-1959", label: "1950s", count: 5 },
      { value: "1930-1939", label: "1930s", count: 1 },
    ]);
  });

  it("never splits a busy year that isn't at the decade's newest end", () => {
    // 2018 is busy but 2019 isn't: splitting 2018 alone would leave a non-contiguous rest.
    const opts = releaseOptions([
      { year: 2018, count: 40 },
      { year: 2019, count: 3 },
    ]);
    expect(opts).toEqual([{ value: "2010-2019", label: "2010s", count: 43 }]);
  });

  it("drops a decade's range option when every year in it was split off", () => {
    const opts = releaseOptions([{ year: 2026, count: 30 }]);
    expect(opts).toEqual([{ value: "2026-2026", label: "2026", count: 30 }]);
  });
});

describe("parseReleaseRange", () => {
  it("parses an option value into the api's yearFrom/yearTo", () => {
    expect(parseReleaseRange("2020-2024")).toEqual({ yearFrom: 2020, yearTo: 2024 });
    expect(parseReleaseRange("2026-2026")).toEqual({ yearFrom: 2026, yearTo: 2026 });
  });

  it("rejects anything else, including a reversed range", () => {
    expect(parseReleaseRange("2024-2020")).toBeNull();
    expect(parseReleaseRange("1990")).toBeNull();
    expect(parseReleaseRange(null)).toBeNull();
  });
});
