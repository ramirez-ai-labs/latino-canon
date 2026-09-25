import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSeedFile, parseSeedRemovals, type SeedTitle } from "./seed-diff.js";
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
    const raw = readFileSync(new URL("./seed/canon.seed.json", import.meta.url), "utf8");
    const seed = parseSeedFile(raw);
    expect(seed.length).toBeGreaterThan(200);
    expect(validateSeed(seed, seed, parseSeedRemovals(raw))).toEqual([]);
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

  describe("removals", () => {
    const film = (title: string, year: number, tmdbId: number): SeedTitle => ({
      ref: `${title} (${year})`,
      title,
      year,
      kind: "film",
      tmdbId,
      seedInclusionTypes: ["led_by"],
    });
    // #226 added Brazil; #227, branched from the same base, appended Mexico in the same
    // place and its merge replaced the Brazil entries instead of keeping them.
    const brazil = [film("Limite", 1931, 1), film("Terra em Transe", 1967, 2), film("Pixote", 1980, 3)];
    const mexico = [film("Canoa", 1976, 4), film("Rojo amanecer", 1989, 5)];

    it("catches a merge that drops another PR's entries - #227 over #226", () => {
      const errors = validateSeed([maid, ...brazil], [maid, ...mexico]);
      expect(errors.filter((e) => e.includes("was removed from titles"))).toHaveLength(3);
      expect(errors[0]).toContain('"Limite (1931)" was removed');
    });

    it("allows a removal listed in the ledger with a reason", () => {
      const removed = [{ ref: "Limite (1931)", reason: "duplicate of an existing entry" }];
      expect(validateSeed([maid, brazil[0]!], [maid], removed)).toEqual([]);
    });

    it("requires a reason", () => {
      expect(validateSeed([maid, brazil[0]!], [maid], [{ ref: "Limite (1931)", reason: " " }])).toEqual([
        'removed "Limite (1931)": a reason is required',
      ]);
    });

    it("rejects a ref that is both listed and removed", () => {
      const errors = validateSeed([maid], [maid], [{ ref: "The Maid (2009)", reason: "x" }]);
      expect(errors).toEqual([expect.stringContaining("in both titles and removed")]);
    });
  });
});
