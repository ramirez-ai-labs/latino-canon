import { describe, expect, it } from "vitest";
import type { IngestParams } from "./bindings.js";
import { normalizeTitle, slugId } from "./normalize.js";
import type { TmdbDetails } from "./sources/tmdb.js";

describe("slugId", () => {
  it("lowercases, strips accents/punctuation, and joins with the year", () => {
    expect(slugId("Real Women Have Curves", 2002)).toBe("real-women-have-curves-2002");
    expect(slugId("¿Qué culpa tiene el niño?", 2016)).toBe("que-culpa-tiene-el-nino-2016");
  });
});

const params: IngestParams = { ref: "Mi Familia (1995)", title: "Mi Familia", year: 1995, kind: "film" };

function details(overrides: Partial<TmdbDetails> = {}): TmdbDetails {
  return {
    tmdbId: 502,
    imdbId: "tt0115963",
    title: "Mi Familia",
    originalTitle: "Mi Familia",
    overview: "Three generations of a Mexican-American family in East LA.",
    posterPath: "/mifamilia.jpg",
    releaseYear: 1995,
    lastYear: null,
    countries: ["US"],
    languages: ["en", "es"],
    runtime: 128,
    popularity: 8.4,
    adult: false,
    credits: { directors: [], writers: [], creators: [], cast: [] },
    ...overrides,
  };
}

describe("normalizeTitle", () => {
  it("derives the id from title+year and nulls originalTitle when it matches title", () => {
    const t = normalizeTitle(params, details(), null);
    expect(t.id).toBe("mi-familia-1995");
    expect(t.originalTitle).toBeNull();
  });

  it("keeps a distinct originalTitle", () => {
    const t = normalizeTitle(params, details({ originalTitle: "Machuca" }), null);
    expect(t.originalTitle).toBe("Machuca");
  });

  it("maps credits to Credit[] with role-scoped ordering and stable person ids", () => {
    const t = normalizeTitle(
      params,
      details({
        credits: {
          directors: [{ id: 20, name: "Gregory Nava", gender: "male" }],
          writers: [
            { id: 20, name: "Gregory Nava", gender: "male" },
            { id: 21, name: "Anna Thomas", gender: "female" },
          ],
          creators: [],
          cast: [{ id: 10, name: "Jimmy Smits", gender: "male", character: "Jimmy Sanchez", order: 0 }],
        },
      }),
      null,
    );

    expect(t.credits).toEqual([
      { person: { id: "p20", tmdbId: 20, name: "Gregory Nava", knownForDepartment: null, gender: "male" }, role: "director", character: null, order: 0 },
      { person: { id: "p20", tmdbId: 20, name: "Gregory Nava", knownForDepartment: null, gender: "male" }, role: "writer", character: null, order: 0 },
      { person: { id: "p21", tmdbId: 21, name: "Anna Thomas", knownForDepartment: null, gender: "female" }, role: "writer", character: null, order: 1 },
      { person: { id: "p10", tmdbId: 10, name: "Jimmy Smits", knownForDepartment: null, gender: "male" }, role: "cast", character: "Jimmy Sanchez", order: 0 },
    ]);
  });

  it("drops a duplicate person within the same role instead of emitting two rows", () => {
    const t = normalizeTitle(
      params,
      details({
        credits: {
          directors: [
            { id: 20, name: "Gregory Nava", gender: "male" },
            { id: 20, name: "Gregory Nava", gender: "male" },
          ],
          writers: [],
          creators: [],
          cast: [],
        },
      }),
      null,
    );
    expect(t.credits).toHaveLength(1);
  });

  it("sets yearEnd from lastYear for a series but not a film", () => {
    const seriesParams: IngestParams = { ...params, kind: "series" };
    const t = normalizeTitle(seriesParams, details({ lastYear: 2020 }), null);
    expect(t.yearEnd).toBe(2020);

    const filmT = normalizeTitle(params, details({ lastYear: 2020 }), null);
    expect(filmT.yearEnd).toBeNull();
  });
});
