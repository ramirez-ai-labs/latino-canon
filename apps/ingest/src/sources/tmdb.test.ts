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
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/search/movie?");
  });

  it("throws rather than picking an unrelated title by year-proximity alone", async () => {
    // Real incident: "No" (2012, Pablo Larraín) is too short/common for TMDB's search
    // to return an exact match at all - every real candidate here is a different film
    // that merely contains "No" as a word. Before this guard, the algorithm picked
    // "No Strings Attached" (2011) purely because its year was closest to 2012, and
    // that wrong film got fully ingested, classified, and blurbed as a Latino-canon
    // title in production.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { id: 634649, title: "Spider-Man: No Way Home", release_date: "2021-12-15" },
            { id: 41630, title: "No Strings Attached", release_date: "2011-01-21" },
            { id: 370172, title: "No Time to Die", release_date: "2021-09-29" },
          ],
        }),
      ),
    );
    await expect(resolveTmdbId(env, "No", 2012, "film")).rejects.toThrow(/no exact title match/);
  });

  it("never sends &year= - TMDB's server-side year filter excludes undated candidates entirely", async () => {
    // Real bug: "20 Pounds to Happiness" exists on TMDB with no release_date. A plain
    // title search found it; adding &year=2025 made TMDB return zero results, even
    // though this function's own scoreCandidate already disambiguates by year
    // client-side. The fix is to never filter server-side and let scoreCandidate do
    // the one job it was already doing.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ results: [{ id: 9, title: "20 Pounds to Happiness", release_date: "" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveTmdbId(env, "20 Pounds to Happiness", 2025, "film")).resolves.toBe(9);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("year=");
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
              { id: 10, name: "Jimmy Smits", gender: 2, character: "Jimmy Sanchez", order: 0 },
              { id: 11, name: "Esai Morales", gender: 2, character: "Chucho Sanchez", order: 1 },
            ],
            crew: [
              { id: 20, name: "Gregory Nava", gender: 2, job: "Director", department: "Directing" },
              { id: 20, name: "Gregory Nava", gender: 2, job: "Writer", department: "Writing" },
              { id: 21, name: "Anna Thomas", gender: 1, job: "Screenplay", department: "Writing" },
              // TMDB's gender field is self-reported and frequently unset (0) - the
              // person's row should still map, just with a null gender.
              { id: 22, name: "Unspecified Person", gender: 0, job: "Producer", department: "Production" },
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
    expect(details.credits.directors).toEqual([{ id: 20, name: "Gregory Nava", gender: "male" }]);
    // Gregory Nava directed AND wrote — appears once per role, not duplicated within a role.
    expect(details.credits.writers).toEqual([
      { id: 20, name: "Gregory Nava", gender: "male" },
      { id: 21, name: "Anna Thomas", gender: "female" },
    ]);
    expect(details.credits.creators).toEqual([]);
    expect(details.credits.cast).toHaveLength(2);
  });

  it("maps TMDB's gender enum (0/1/2/3), defaulting anything but 1/2/3 to null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: 1,
          title: "Untitled",
          release_date: "2020-01-01",
          credits: {
            cast: [],
            crew: [
              { id: 1, name: "Not Specified", gender: 0, job: "Director", department: "Directing" },
              { id: 2, name: "Female Director", gender: 1, job: "Director", department: "Directing" },
              { id: 3, name: "Male Director", gender: 2, job: "Director", department: "Directing" },
              { id: 4, name: "Non-Binary Director", gender: 3, job: "Director", department: "Directing" },
              { id: 5, name: "No Gender Field", job: "Director", department: "Directing" },
            ],
          },
        }),
      ),
    );

    const { credits } = await fetchTmdbDetails(env, 1, "film");
    expect(credits.directors.map((d) => d.gender)).toEqual([null, "female", "male", "non_binary", null]);
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
          created_by: [{ id: 30, name: "Gloria Calderón Kellett", gender: 1 }, { id: 31, name: "Mike Royce", gender: 2 }],
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
