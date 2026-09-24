import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { SearchResponse } from "@latino-canon/core";
import app from "../index.js";

/**
 * Route-level regressions for queries whose meaning lives entirely in filters. No AI
 * binding in tests, so rewriteQuery falls back to its rules pass - which is enough to
 * lift genre=Animation and kind=film out of "animation films" and leave just "films".
 *
 * Found live: that leftover "films" went to BM25 (no synopsis says "films") and to
 * Vectorize (every title is a film, so similarity is noise), and genre was only
 * post-filtered over semantic's top-100 - The Book of Life, correctly tagged Animation,
 * never made the cut. A filler-only query must list what matches the filters instead.
 */
const TITLES: { id: string; kind: string; genres: string[]; countries: string[]; popularity: number }[] = [
  { id: "the-book-of-life-2014", kind: "film", genres: ["Animation", "Family"], countries: ["US"], popularity: 9 },
  { id: "coco-2017", kind: "film", genres: ["Animation"], countries: ["US"], popularity: 10 },
  { id: "gloria-2013", kind: "film", genres: ["Drama"], countries: ["CL"], popularity: 8 },
  { id: "animated-series-2020", kind: "series", genres: ["Animation"], countries: ["US"], popularity: 7 },
];

beforeAll(async () => {
  for (const t of TITLES) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start, countries, languages, genres, popularity)
         VALUES (?1, ?2, ?1, 2015, ?3, '[]', ?4, ?5)`,
      ).bind(t.id, t.kind, JSON.stringify(t.countries), JSON.stringify(t.genres), t.popularity),
      env.DB.prepare(
        `INSERT INTO title_tags (title_id, tag_id, confidence, source)
         SELECT ?1, id, 1.0, 'seed' FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'`,
      ).bind(t.id),
    ]);
  }
});

async function search(qs: string): Promise<SearchResponse> {
  const ctx = createExecutionContext();
  const res = await app.request(`/search?${qs}`, {}, env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /search - filter-only queries", () => {
  it("'animation films' lists every animated film, not a text search for 'films'", async () => {
    const body = await search("q=animation%20films");
    expect(body.interpretation?.filters).toMatchObject({ genre: "Animation", kind: "film" });
    expect(body.results.map((r) => r.id)).toEqual(["coco-2017", "the-book-of-life-2014"]);
  });

  it("relaxes an inferred filter that matches nothing, without dropping the genre", async () => {
    // Every fixture is from 2015, so the inferred decade=1990 zeroes the results. The old
    // fallback dropped every inferred filter at once (Gloria would come back); now only
    // the decade goes, and the interpretation stops claiming it.
    const body = await search("q=90s%20animation%20films");
    expect(body.results.map((r) => r.id)).toEqual(["coco-2017", "the-book-of-life-2014"]);
    expect(body.interpretation?.filters).toEqual({ genre: "Animation", kind: "film" });
    expect(body.interpretation?.rationale).toContain("decade");
  });

  it("never relaxes a filter the caller chose explicitly", async () => {
    const body = await search("q=90s%20animation%20films&decade=1990");
    expect(body.results).toHaveLength(0);
  });
});
