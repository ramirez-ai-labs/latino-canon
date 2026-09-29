import { describe, expect, it } from "vitest";
import { countryOptions, decadeOptions } from "./facets.js";

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

  it("keeps a code Intl can't name as its own label instead of dropping it", () => {
    expect(countryOptions([{ code: "ZZ", count: 1 }])[0]!.value).toBe("ZZ");
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
