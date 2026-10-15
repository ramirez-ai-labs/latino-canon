import { describe, expect, it } from "vitest";
import { tmdbWatchUrl, watchState } from "./watch.js";

const checkedAt = "2026-10-15T08:00:00.000Z";

describe("tmdbWatchUrl", () => {
  it("links a film to TMDB's movie watch page, opening on the US", () => {
    expect(tmdbWatchUrl({ kind: "film", tmdbId: 1902 })).toBe("https://www.themoviedb.org/movie/1902/watch?locale=US");
  });

  it("links a series to /tv and a special to /movie, the split ingest fetches with", () => {
    expect(tmdbWatchUrl({ kind: "series", tmdbId: 335227 })).toBe("https://www.themoviedb.org/tv/335227/watch?locale=US");
    expect(tmdbWatchUrl({ kind: "special", tmdbId: 5 })).toBe("https://www.themoviedb.org/movie/5/watch?locale=US");
  });

  it("has nothing to link without a TMDB id", () => {
    expect(tmdbWatchUrl({ kind: "film", tmdbId: null })).toBeNull();
  });
});

describe("watchState", () => {
  const abre = { kind: "film" as const, tmdbId: 1902 };

  it("links when the US has offers", () => {
    expect(watchState({ ...abre, watch: { us: true, anywhere: true, checkedAt } }).kind).toBe("link");
  });

  it("links when not checked yet - TMDB's page answers either way", () => {
    expect(watchState({ ...abre, watch: null }).kind).toBe("link");
    // An api deployed before the field existed sends no `watch` at all.
    expect(watchState(abre).kind).toBe("link");
  });

  it("points to other countries when only they have offers", () => {
    expect(watchState({ ...abre, watch: { us: false, anywhere: true, checkedAt } })).toEqual({
      kind: "elsewhere",
      href: "https://www.themoviedb.org/movie/1902/watch?locale=US",
      checkedAt,
    });
  });

  it("says nowhere instead of linking to TMDB's 'There are no offers' (Bound by Honor)", () => {
    expect(watchState({ kind: "film", tmdbId: 9702, watch: { us: false, anywhere: false, checkedAt } })).toEqual({
      kind: "nowhere",
      checkedAt,
    });
  });

  it("shows nothing without a TMDB id", () => {
    expect(watchState({ kind: "film", tmdbId: null, watch: null }).kind).toBe("none");
  });
});
