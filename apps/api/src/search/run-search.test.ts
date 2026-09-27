import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { runSearch } from "./run-search.js";

/**
 * Retrieval runs on the user's own words; the rewrite's cleaned text only decides whether
 * a query is filter-only. Found by the retrieval eval (2026-09-27): the rewrite turned
 * "telenovela parody series" into "parody series", and the one word that finds Jane the
 * Virgin never reached search. No Vectorize binding in tests, so these run keyword-only.
 */
const TITLES = [
  // Matches only the word the rewrite dropped.
  { id: "jane-the-virgin-2014", kind: "series", genres: ["Comedy"], pop: 5, synopsis: "A telenovela about a young woman accidentally inseminated." },
  // Matches the rewrite's leftover words ("parody series") better than Jane does.
  { id: "office-sketches-2020", kind: "series", genres: ["Comedy"], pop: 9, synopsis: "A parody series about a series of office parties." },
  // "series" is a common word here; "telenovela" appears once - as in the real catalog.
  { id: "coco-2017", kind: "film", genres: ["Animation"], pop: 10, synopsis: "A boy who dreams of music, in a series of adventures." },
  { id: "vivo-2021", kind: "film", genres: ["Animation"], pop: 8, synopsis: "A kinkajou musician's series of songs in Miami." },
];

beforeAll(async () => {
  for (const t of TITLES) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start, countries, languages, genres, popularity, synopsis)
         VALUES (?1, ?2, ?1, 2015, '["US"]', '[]', ?3, ?4, ?5)`,
      ).bind(t.id, t.kind, JSON.stringify(t.genres), t.pop, t.synopsis),
      env.DB.prepare(
        `INSERT INTO title_tags (title_id, tag_id, confidence, source)
         SELECT ?1, id, 1.0, 'seed' FROM tags WHERE kind = 'inclusion_type' AND slug = 'about_community'`,
      ).bind(t.id),
      env.DB.prepare(
        `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
         SELECT rowid, id, '', ?2, '', '', '' FROM titles WHERE id = ?1`,
      ).bind(t.id, t.synopsis),
    ]);
  }
});

describe("runSearch: original words for retrieval, cleaned text for filter-only detection", () => {
  const telenovela = (query: string, cleanedQuery?: string) =>
    runSearch(env, { query, cleanedQuery, mode: "hybrid", explicit: {}, inferred: { kind: "series" }, limit: 5, offset: 0 });

  it("the rewrite's cleaned text alone never finds it (the old behavior)", async () => {
    const plan = await telenovela("parody series");
    expect(plan.hits.map((h) => h.titleId)).not.toContain("jane-the-virgin-2014");
  });

  it("searching the user's words too finds it, by the word the rewrite dropped", async () => {
    const plan = await telenovela("telenovela parody series", "parody series");
    expect(plan.hits.map((h) => h.titleId)).toContain("jane-the-virgin-2014");
    expect(plan.filterMode).toBe("boost");
  });

  it("still treats a filter-only query as a strict, browse-by-filter list", async () => {
    const plan = await runSearch(env, {
      query: "animation films",
      cleanedQuery: "films",
      mode: "hybrid",
      explicit: {},
      inferred: { genre: "Animation", kind: "film" },
      limit: 5,
      offset: 0,
    });
    expect(plan.filterMode).toBe("strict");
    expect(plan.hits.map((h) => h.titleId)).toEqual(["coco-2017", "vivo-2021"]);
  });

  it("without cleanedQuery, falls back to the query itself (the curation agent's path)", async () => {
    const plan = await runSearch(env, {
      query: "films",
      mode: "hybrid",
      explicit: {},
      inferred: { genre: "Animation" },
      limit: 5,
      offset: 0,
    });
    expect(plan.filterMode).toBe("strict");
  });
});
