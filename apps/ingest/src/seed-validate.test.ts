import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSeedFile, type SeedTitle } from "./seed-diff.js";
import { validateSeed } from "./seed-validate.js";

const maid: SeedTitle = {
  ref: "The Maid (2009)",
  title: "The Maid",
  year: 2009,
  kind: "film",
  tmdbId: 28118,
  seedInclusionTypes: ["led_by"],
};
const vida: SeedTitle = {
  ref: "Vida (2018)",
  title: "Vida",
  year: 2018,
  kind: "series",
  tmdbId: 28118, // same number as a movie id - TMDB ids are per media type
  seedInclusionTypes: ["created_by"],
};

describe("validateSeed", () => {
  it("the real canon.seed.json passes", () => {
    const seed = parseSeedFile(readFileSync(new URL("./seed/canon.seed.json", import.meta.url), "utf8"));
    expect(seed.length).toBeGreaterThan(200);
    expect(validateSeed(seed, seed)).toEqual([]);
  });

  it("accepts a new pinned entry, and a movie and a series sharing a TMDB id number", () => {
    expect(validateSeed([maid], [maid, vida])).toEqual([]);
  });

  it("rejects a new entry without tmdbId - the Phase 1 wrong-film / never-ingested failure", () => {
    const olvidados: SeedTitle = {
      ref: "Los olvidados (1950)",
      title: "Los olvidados",
      year: 1950,
      kind: "film",
      seedInclusionTypes: ["led_by"],
    };
    expect(validateSeed([maid], [maid, olvidados])).toEqual([expect.stringContaining("must pin tmdbId")]);
  });

  it("grandfathers an existing unpinned entry", () => {
    const unpinned: SeedTitle = { ...maid, tmdbId: undefined };
    expect(validateSeed([unpinned], [unpinned])).toEqual([]);
  });

  it("catches #234's duplicate The Maid (2009), by ref and by tmdbId", () => {
    const errors = validateSeed([maid], [maid, maid]);
    expect(errors).toContain('duplicate ref: "The Maid (2009)" repeats "The Maid (2009)"');
    expect(errors.some((e) => e.startsWith("duplicate tmdbId"))).toBe(true);
  });

  it("treats accents and punctuation as the same title for title + year", () => {
    const a = { ...maid, ref: "Y Tu Mamá También (2001)", title: "Y Tu Mamá También", year: 2001, tmdbId: 1391 };
    const b = { ...a, ref: "Y Tu Mama Tambien (2001)", title: "Y Tu Mama Tambien", tmdbId: 9999 };
    expect(validateSeed([a], [a, b])).toEqual([expect.stringContaining("duplicate title + year")]);
  });

  it("rejects an unknown inclusion type, an empty type list, a bad kind and a bad year", () => {
    const bad = {
      ...maid,
      ref: "Bad (0)",
      year: 0,
      kind: "movie",
      seedInclusionTypes: ["latino"],
    } as unknown as SeedTitle;
    const empty = { ...maid, ref: "Empty (2009)", title: "Empty", tmdbId: 1, seedInclusionTypes: [] };
    const errors = validateSeed([bad, empty], [bad, empty]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("year must be"),
        expect.stringContaining("kind must be"),
        expect.stringContaining('unknown inclusion type "latino"'),
        expect.stringContaining("at least one type"),
      ]),
    );
  });
});
