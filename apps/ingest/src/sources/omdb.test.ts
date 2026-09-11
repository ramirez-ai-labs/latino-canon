import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../bindings.js";
import { fetchOmdbRatings } from "./omdb.js";

const env = { OMDB_API_KEY: "test-key" } as Env;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOmdbRatings", () => {
  it("returns null without calling OMDb when there's no imdbId", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOmdbRatings(env, null)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses ratings, strips vote-count commas, and drops N/A fields to null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          Response: "True",
          imdbRating: "7.4",
          imdbVotes: "12,345",
          Metascore: "N/A",
          Awards: "Won 1 Oscar. 5 wins & 3 nominations.",
        }),
      ),
    );

    await expect(fetchOmdbRatings(env, "tt0115963")).resolves.toEqual({
      imdbRating: 7.4,
      imdbVotes: 12345,
      metascore: null,
      awards: "Won 1 Oscar. 5 wins & 3 nominations.",
    });
  });

  it("returns null when OMDb has no record for the id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ Response: "False", Error: "Incorrect IMDb ID." })),
    );
    await expect(fetchOmdbRatings(env, "tt0000000")).resolves.toBeNull();
  });
});
