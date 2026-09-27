import { describe, expect, it } from "vitest";
import { toFtsMatch } from "./lexical.js";

describe("toFtsMatch", () => {
  it("drops English and Spanish stopwords, which would otherwise match as prefixes", () => {
    // "un"* matched The Unscrupulous Ones and "de"* Death of a Bureaucrat (eval, 2026-09-27).
    expect(toFtsMatch("dos estafadores venden estampillas falsas a un coleccionista")).toBe(
      '"dos"* OR "estafadores"* OR "venden"* OR "estampillas"* OR "falsas"* OR "coleccionista"*',
    );
    expect(toFtsMatch("Mexican family stories from the 90s")).toBe('"mexican"* OR "family"* OR "stories"* OR "90s"*');
  });

  it("keeps content words, strips punctuation and FTS operators", () => {
    expect(toFtsMatch('chamán amazónico, último de su pueblo, y dos "científicos"')).toBe(
      '"chamán"* OR "amazónico"* OR "último"* OR "pueblo"* OR "dos"* OR "científicos"*',
    );
  });

  it("returns null when nothing but stopwords is left", () => {
    expect(toFtsMatch("de la")).toBeNull();
  });
});
