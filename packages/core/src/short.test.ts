import { describe, expect, it } from "vitest";
import { isShortFilm, SHORT_FILM_MAX_MINUTES } from "./short.js";

describe("isShortFilm", () => {
  it("labels a film of 40 minutes or less, the Academy's cutoff", () => {
    expect(isShortFilm({ kind: "film", runtime: 14 })).toBe(true);
    expect(isShortFilm({ kind: "film", runtime: SHORT_FILM_MAX_MINUTES })).toBe(true);
  });

  it("doesn't label a feature", () => {
    expect(isShortFilm({ kind: "film", runtime: 41 })).toBe(false);
    expect(isShortFilm({ kind: "film", runtime: 94 })).toBe(false);
  });

  it("doesn't guess when TMDB has no runtime", () => {
    expect(isShortFilm({ kind: "film", runtime: null })).toBe(false);
    expect(isShortFilm({ kind: "film", runtime: 0 })).toBe(false);
  });

  it("never labels a series or special, whose runtime is per episode or per show", () => {
    expect(isShortFilm({ kind: "series", runtime: 25 })).toBe(false);
    expect(isShortFilm({ kind: "special", runtime: 30 })).toBe(false);
  });
});
