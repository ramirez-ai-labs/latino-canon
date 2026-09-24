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
const TITLES: { id: string; kind: string; genres: string[]; countries: string[]; popularity: number; synopsis: string }[] = [
  { id: "the-book-of-life-2014", kind: "film", genres: ["Animation", "Family"], countries: ["US"], popularity: 9, synopsis: "A family festival on the Day of the Dead." },
  { id: "coco-2017", kind: "film", genres: ["Animation"], countries: ["US"], popularity: 10, synopsis: "A boy who dreams of music." },
  { id: "gloria-2013", kind: "film", genres: ["Drama"], countries: ["CL"], popularity: 8, synopsis: "A divorcee rediscovers joy." },
  { id: "animated-series-2020", kind: "series", genres: ["Animation"], countries: ["US"], popularity: 7, synopsis: "Weekly cartoon adventures." },
  { id: "in-the-heights-2021", kind: "film", genres: ["Drama", "Romance"], countries: ["US"], popularity: 6, synopsis: "A bodega owner in Washington Heights." },
  { id: "family-drama-2015", kind: "film", genres: ["Drama"], countries: ["US"], popularity: 5, synopsis: "A family festival reunion drama." },
];

beforeAll(async () => {
  for (const t of TITLES) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start, countries, languages, genres, popularity, synopsis)
         VALUES (?1, ?2, ?1, 2015, ?3, '[]', ?4, ?5, ?6)`,
      ).bind(t.id, t.kind, JSON.stringify(t.countries), JSON.stringify(t.genres), t.popularity, t.synopsis),
      env.DB.prepare(
        `INSERT INTO title_tags (title_id, tag_id, confidence, source)
         SELECT ?1, id, 1.0, 'seed' FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'`,
      ).bind(t.id),
      env.DB.prepare(
        `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
         SELECT rowid, id, '', ?2, '', '', '' FROM titles WHERE id = ?1`,
      ).bind(t.id, t.synopsis),
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

// Lexical mode - no AI/Vectorize bindings in tests, and BM25 alone is enough to show how
// inferred filters meet real query text.
describe("GET /search - inferred filters on a query with content", () => {
  it("a wrong inferred filter no longer excludes the text's match", async () => {
    // Rules infer genre=Animation from "animated"; In the Heights isn't animated but is
    // exactly what "washington heights" names. It used to be filtered out before ranking.
    const body = await search("q=animated%20washington%20heights&mode=lexical");
    expect(body.interpretation?.filters).toEqual({ genre: "Animation" });
    expect(body.interpretation?.filterMode).toBe("boost");
    expect(body.results.map((r) => r.id)).toContain("in-the-heights-2021");
  });

  it("a correct inferred filter lifts the matching title above an equal text match", async () => {
    const body = await search("q=animated%20family%20festival&mode=lexical");
    const ids = body.results.map((r) => r.id);
    expect(ids).toContain("family-drama-2015");
    expect(ids.indexOf("the-book-of-life-2014")).toBeLessThan(ids.indexOf("family-drama-2015"));
  });

  it("an explicit facet still excludes", async () => {
    const body = await search("q=washington%20heights&mode=lexical&genre=Animation");
    expect(body.results).toHaveLength(0);
  });
});
