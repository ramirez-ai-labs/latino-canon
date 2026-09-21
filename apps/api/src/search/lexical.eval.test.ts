import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { aggregate } from "@latino-canon/eval";
import { lexicalSearch } from "./lexical.js";

/**
 * CI regression gate for BM25 retrieval, using the real schema + the real query path
 * (lexicalSearch → titles_fts) against a small hand-authored fixture — not the editorial
 * golden set in packages/eval/src/datasets/queries.jsonl, which needs semantic search and
 * real seed data (blocked on the TMDB/OMDb mapping TODOs in apps/ingest) to mean anything.
 * This is deliberately narrower: every query below is designed to be answerable by
 * keyword overlap alone, so a regression here means the FTS query or tokenization broke,
 * not that ranking quality drifted. Once ingest can populate D1 for real,
 * `pnpm eval:retrieval` against a deployed worker is the fuller, hybrid/semantic check.
 */

interface Fixture {
  id: string;
  title: string;
  synopsis: string;
  people: string;
  aliases?: string;
}

const FIXTURES: Fixture[] = [
  {
    id: "selena-1997",
    title: "Selena",
    synopsis: "A Tejano music sensation rises to fame before her life is cut short.",
    people: "Jennifer Lopez, Edward James Olmos",
  },
  {
    id: "stand-and-deliver-1988",
    title: "Stand and Deliver",
    synopsis: "A high school teacher inspires his students to excel at calculus against long odds.",
    people: "Edward James Olmos",
  },
  {
    id: "real-women-have-curves-2002",
    title: "Real Women Have Curves",
    synopsis: "A teenager in East LA confronts body image and family expectations the summer after high school.",
    people: "America Ferrera",
  },
  {
    id: "in-the-heights-2021",
    title: "In the Heights",
    synopsis: "A bodega owner in Washington Heights dreams of a bigger life as the neighborhood changes around him.",
    people: "Anthony Ramos, Lin-Manuel Miranda",
  },
  {
    id: "gentefied-2020",
    title: "Gentefied",
    synopsis: "Three cousins fight to keep their grandfather's taco shop open as gentrification transforms Boyle Heights.",
    people: "",
  },
  {
    id: "one-day-at-a-time-2017",
    title: "One Day at a Time",
    synopsis: "A Cuban-American single mother navigates family life in a multi-generation household sitcom.",
    people: "Justina Machado",
  },
  {
    id: "y-tu-mama-tambien-2001",
    title: "Y Tu Mamá También",
    synopsis: "Two teenage friends and an older woman take a road trip through Mexico.",
    people: "Gael García Bernal, Diego Luna",
    aliases: "And Your Mother Too",
  },
];

const GOLD: { id: string; query: string; relevant: string[] }[] = [
  { id: "g01", query: "Selena", relevant: ["selena-1997"] },
  { id: "g02", query: "teacher inspires students", relevant: ["stand-and-deliver-1988"] },
  { id: "g03", query: "body image East LA", relevant: ["real-women-have-curves-2002"] },
  { id: "g04", query: "Washington Heights bodega", relevant: ["in-the-heights-2021"] },
  { id: "g05", query: "gentrification Boyle Heights taco shop", relevant: ["gentefied-2020"] },
  { id: "g06", query: "Cuban-American sitcom family", relevant: ["one-day-at-a-time-2017"] },
  // Matches only via the aliases column - none of these words appear in this fixture's
  // (or any other's) title/synopsis/people. Proves the new titles_fts column and its
  // bm25 weight actually retrieve, not just that the migration/insert doesn't error.
  { id: "g07", query: "And Your Mother Too", relevant: ["y-tu-mama-tambien-2001"] },
];

beforeAll(async () => {
  let year = 1988;
  for (const f of FIXTURES) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start) VALUES (?1, 'film', ?2, ?3)`,
      ).bind(f.id, f.title, year++),
      env.DB.prepare(
        `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
         SELECT rowid, ?2, '', ?3, ?4, '', ?5 FROM titles WHERE id = ?1`,
      ).bind(f.id, f.title, f.synopsis, f.people, f.aliases ?? ""),
      // lexicalSearch now always applies the inclusion_type visibility gate - without a
      // qualifying tag here, every query below would silently return zero hits, not a
      // BM25/tokenizer regression.
      env.DB.prepare(
        `INSERT INTO title_tags (title_id, tag_id, confidence, source)
         SELECT ?1, id, 1.0, 'seed' FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'`,
      ).bind(f.id),
    ]);
  }
});

describe("lexicalSearch (fixture regression)", () => {
  for (const g of GOLD) {
    it(`finds "${g.relevant[0]}" for "${g.query}"`, async () => {
      const hits = await lexicalSearch(env, g.query, {}, 5);
      expect(hits.map((h) => h.titleId)).toContain(g.relevant[0]);
    });
  }

  // Regression for a live bug: lexicalSearch's own `MATCH ?1` and filterToSql's
  // placeholders collided (both started numbering at ?1), so a text query combined
  // with a structured filter always returned zero rows even when each alone matched.
  it("still finds a match when a structured filter is combined with the text query", async () => {
    const hits = await lexicalSearch(env, "Selena", { decade: 1980 }, 5);
    expect(hits.map((h) => h.titleId)).toContain("selena-1997");
  });

  it("meets the recall@5 / MRR floor across the fixture set", async () => {
    const perQuery = await Promise.all(
      GOLD.map(async (g) => ({
        id: g.id,
        ranked: (await lexicalSearch(env, g.query, {}, 5)).map((h) => h.titleId),
        relevant: g.relevant,
      })),
    );
    const scores = aggregate(perQuery);
    console.table(scores);

    // Every gold query here is a literal keyword match by construction — any drop below
    // 1.0 means the FTS query, tokenizer, or ranking changed in a way worth reviewing.
    expect(scores["recall@5"]).toBe(1);
    expect(scores.mrr).toBe(1);
  });
});
