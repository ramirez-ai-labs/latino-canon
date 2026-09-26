import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { SearchResponse } from "@latino-canon/core";
import app from "../index.js";
import { exactTitleIds, normalizeTitle } from "./exact-title.js";

/**
 * Fixture: the case that motivated the rule - an exact title search that BM25 ranked
 * below a decoy whose synopsis repeats the query's words - plus namesakes and prefixes.
 */
const TITLES = [
  { id: "y-tu-mama-tambien-2001", title: "Y Tu Mamá También", orig: null, year: 2001, pop: 9, synopsis: "Two teenagers take a road trip with an older woman." },
  { id: "mama-road-decoy-2010", title: "Mama Road", orig: null, year: 2010, pop: 5, synopsis: "Y tu mama tambien, tu mama tambien: mama mama tambien tambien." },
  { id: "coco-2017", title: "Coco", orig: null, year: 2017, pop: 10, synopsis: "A boy who dreams of music." },
  { id: "coco-chanel-2009", title: "Coco Chanel", orig: null, year: 2009, pop: 3, synopsis: "A designer's early years." },
  { id: "gloria-2013", title: "Gloria", orig: null, year: 2013, pop: 6, synopsis: "A divorcee rediscovers joy in Santiago." },
  { id: "gloria-1980", title: "Gloria", orig: null, year: 1980, pop: 8, synopsis: "A woman protects a boy from the mob." },
  { id: "the-young-and-the-damned-1950", title: "The Young and the Damned", orig: "Los olvidados", year: 1950, pop: 4, synopsis: "Street children in Mexico City." },
];

beforeAll(async () => {
  for (const t of TITLES) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, original_title, year_start, countries, languages, genres, popularity, synopsis)
         VALUES (?1, 'film', ?2, ?3, ?4, '[]', '[]', '[]', ?5, ?6)`,
      ).bind(t.id, t.title, t.orig, t.year, t.pop, t.synopsis),
      env.DB.prepare(
        `INSERT INTO title_tags (title_id, tag_id, confidence, source)
         SELECT ?1, id, 1.0, 'seed' FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'`,
      ).bind(t.id),
      env.DB.prepare(
        `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
         SELECT rowid, title, COALESCE(original_title, ''), synopsis, '', '', '' FROM titles WHERE id = ?1`,
      ).bind(t.id),
    ]);
  }
  await env.DB.prepare("INSERT INTO title_aliases (title_id, alias, kind) VALUES (?1, ?2, 'translation')")
    .bind("y-tu-mama-tambien-2001", "And Your Mother Too")
    .run();
  await env.DB.prepare("UPDATE titles_fts SET aliases = 'And Your Mother Too' WHERE rowid = (SELECT rowid FROM titles WHERE id = ?1)")
    .bind("y-tu-mama-tambien-2001")
    .run();
});

describe("normalizeTitle", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeTitle("Y Tu Mamá También")).toBe("y tu mama tambien");
    expect(normalizeTitle("  ¿Qué culpa tiene el niño?  ")).toBe("que culpa tiene el nino");
  });
});

describe("exactTitleIds", () => {
  it("matches the whole title without accents", async () => {
    expect(await exactTitleIds(env, "y tu mama tambien")).toEqual(["y-tu-mama-tambien-2001"]);
  });

  it("matches an original title and an alias", async () => {
    expect(await exactTitleIds(env, "los olvidados")).toEqual(["the-young-and-the-damned-1950"]);
    expect(await exactTitleIds(env, "And your mother too")).toEqual(["y-tu-mama-tambien-2001"]);
  });

  it("does not match a title that only contains the query", async () => {
    expect(await exactTitleIds(env, "coco")).toEqual(["coco-2017"]);
    expect(await exactTitleIds(env, "mama")).toEqual([]);
  });

  it("returns namesakes by popularity, and a trailing year picks one", async () => {
    expect(await exactTitleIds(env, "gloria")).toEqual(["gloria-1980", "gloria-2013"]);
    expect(await exactTitleIds(env, "Gloria 2013")).toEqual(["gloria-2013"]);
  });
});

describe("GET /search - exact title first", () => {
  async function search(qs: string): Promise<SearchResponse> {
    const ctx = createExecutionContext();
    const res = await app.request(`/search?${qs}`, {}, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    return res.json();
  }

  it("ranks the exact title above a decoy BM25 prefers, and skips the rewrite", async () => {
    const lexical = await search("q=y%20tu%20mama%20tambien&mode=lexical");
    expect(lexical.results[0]?.id).toBe("mama-road-decoy-2010"); // the problem, in lexical mode

    const hybrid = await search("q=y%20tu%20mama%20tambien");
    expect(hybrid.results[0]?.id).toBe("y-tu-mama-tambien-2001");
    expect(hybrid.results.filter((r) => r.id === "y-tu-mama-tambien-2001")).toHaveLength(1);
    expect(hybrid.interpretation).toBeNull();
  });

  it("drops the pinned title from later pages instead of repeating it", async () => {
    const page2 = await search("q=y%20tu%20mama%20tambien&limit=1&offset=1");
    expect(page2.results.map((r) => r.id)).not.toContain("y-tu-mama-tambien-2001");
  });

  it("doesn't pin when the caller set an explicit facet", async () => {
    const body = await search("q=coco&kind=series");
    expect(body.results.map((r) => r.id)).not.toContain("coco-2017");
  });
});
