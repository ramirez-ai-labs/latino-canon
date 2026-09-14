import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../bindings.js";
import { fetchTmdbDetails, resolveTmdbId } from "./tmdb.js";

const env = { TMDB_API_KEY: "test-key" } as Env;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTmdbId", () => {
  it("prefers an exact title match over a closer id ordering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { id: 1, title: "Selena Gomez: My Mind & Me", release_date: "2022-11-04" },
            { id: 2, title: "Selena", release_date: "1997-03-21" },
          ],
        }),
      ),
    );
    await expect(resolveTmdbId(env, "Selena", 1997, "film")).resolves.toBe(2);
  });

  it("breaks ties between same-title candidates by year proximity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { id: 1, name: "Vida", first_air_date: "2004-01-01" },
            { id: 2, name: "Vida", first_air_date: "2018-05-06" },
          ],
        }),
      ),
    );
    await expect(resolveTmdbId(env, "Vida", 2018, "series")).resolves.toBe(2);
  });

  it("throws when TMDB has no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    await expect(resolveTmdbId(env, "Nonexistent Title", 1999, "film")).rejects.toThrow(/no match/);
  });

  it("routes a special to search/movie, the same TMDB surface as film", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ results: [{ id: 5, title: "We'll Do It for Half", release_date: "2020-06-30" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await resolveTmdbId(env, "We'll Do It for Half", 2020, "special");
    expect(fetchMock.mock.calls[0][0]).toContain("/search/movie?");
  });
});

describe("fetchTmdbDetails", () => {
  it("maps a movie payload, distinguishing directors from writers by department", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: 502,
          imdb_id: "tt0115963",
          title: "Mi Familia",
          original_title: "Mi Familia",
          overview: "Three generations of a Mexican-American family in East LA.",
          poster_path: "/mifamilia.jpg",
          release_date: "1995-05-03",
          runtime: 128,
          popularity: 8.4,
          production_countries: [{ iso_3166_1: "US" }],
          spoken_languages: [{ iso_639_1: "en" }, { iso_639_1: "es" }],
          credits: {
            cast: [
              { id: 10, name: "Jimmy Smits", character: "Jimmy Sanchez", order: 0 },
              { id: 11, name: "Esai Morales", character: "Chucho Sanchez", order: 1 },
            ],
            crew: [
              { id: 20, name: "Gregory Nava", job: "Director", department: "Directing" },
              { id: 20, name: "Gregory Nava", job: "Writer", department: "Writing" },
              { id: 21, name: "Anna Thomas", job: "Screenplay", department: "Writing" },
            ],
          },
        }),
      ),
    );

    const details = await fetchTmdbDetails(env, 502, "film");

    expect(details.title).toBe("Mi Familia");
    expect(details.imdbId).toBe("tt0115963");
    expect(details.releaseYear).toBe(1995);
    expect(details.lastYear).toBeNull();
    expect(details.countries).toEqual(["US"]);
    expect(details.languages).toEqual(["en", "es"]);
    expect(details.credits.directors).toEqual([{ id: 20, name: "Gregory Nava" }]);
    // Gregory Nava directed AND wrote — appears once per role, not duplicated within a role.
    expect(details.credits.writers).toEqual([
      { id: 20, name: "Gregory Nava" },
      { id: 21, name: "Anna Thomas" },
    ]);
    expect(details.credits.creators).toEqual([]);
    expect(details.credits.cast).toHaveLength(2);
  });

  it("maps a series payload, pulling imdb_id from external_ids and creators from created_by", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: 61889,
          name: "One Day at a Time",
          original_name: "One Day at a Time",
          overview: "A Cuban-American family navigates life in Los Angeles.",
          poster_path: "/odaat.jpg",
          first_air_date: "2017-01-06",
          last_air_date: "2020-04-14",
          popularity: 12.1,
          origin_country: ["US"],
          spoken_languages: [{ iso_639_1: "en" }],
          created_by: [{ id: 30, name: "Gloria Calderón Kellett" }, { id: 31, name: "Mike Royce" }],
          credits: { cast: [], crew: [] },
          external_ids: { imdb_id: "tt5741386" },
        }),
      ),
    );

    const details = await fetchTmdbDetails(env, 61889, "series");

    expect(details.imdbId).toBe("tt5741386");
    expect(details.releaseYear).toBe(2017);
    expect(details.lastYear).toBe(2020);
    expect(details.countries).toEqual(["US"]);
    expect(details.credits.creators.map((c) => c.name)).toEqual([
      "Gloria Calderón Kellett",
      "Mike Royce",
    ]);
  });

  it("throws when the payload has no release or air date to derive a year from", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: 1, title: "Untitled" })));
    await expect(fetchTmdbDetails(env, 1, "film")).rejects.toThrow(/release\/air date/);
  });
});
