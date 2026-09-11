import { describe, expect, it } from "vitest";
import { diffNewTitles, parseSeedFile, type SeedTitle } from "./seed-diff.js";

const selena: SeedTitle = { ref: "Selena (1997)", title: "Selena", year: 1997, kind: "film" };
const coco: SeedTitle = { ref: "Coco (2017)", title: "Coco", year: 2017, kind: "film" };
const vida: SeedTitle = { ref: "Vida (2018)", title: "Vida", year: 2018, kind: "series" };

describe("parseSeedFile", () => {
  it("reads the titles array out of the seed shape", () => {
    expect(parseSeedFile(JSON.stringify({ $comment: "x", titles: [selena] }))).toEqual([selena]);
  });

  it("treats malformed JSON as no titles, not a crash", () => {
    expect(parseSeedFile("not json")).toEqual([]);
  });

  it("treats a missing titles field as no titles", () => {
    expect(parseSeedFile(JSON.stringify({}))).toEqual([]);
  });
});

describe("diffNewTitles", () => {
  it("returns only titles absent from the before set", () => {
    expect(diffNewTitles([selena], [selena, coco, vida])).toEqual([coco, vida]);
  });

  it("matches on ref, so an edited title (same ref) doesn't count as new", () => {
    const editedSelena = { ...selena, seedInclusionTypes: ["led_by"] };
    expect(diffNewTitles([selena], [editedSelena])).toEqual([]);
  });

  it("returns everything when there's no before snapshot (first-run bootstrap)", () => {
    expect(diffNewTitles([], [selena, coco])).toEqual([selena, coco]);
  });

  it("returns nothing when nothing changed", () => {
    expect(diffNewTitles([selena, coco], [selena, coco])).toEqual([]);
  });
});
