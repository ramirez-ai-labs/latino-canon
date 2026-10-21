import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { browseTitles } from "./browse.js";

/**
 * Regression for a live bug: browseByPopularity picked its top-N-by-popularity window
 * with no visibility gate, then hydrateCards filtered that fixed window down afterward -
 * so a page that should have been full silently came back short, and
 * apps/web/catalog's `results.length > PER_PAGE` pagination check broke ("only 50
 * titles, no next page" even with plenty more qualifying titles left). The gate has to
 * run inside this query, before LIMIT, not just downstream in hydrateCards.
 */
beforeAll(async () => {
  const statements = [];
  for (let i = 0; i < 5; i++) {
    const id = `tagged-${i}`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start, popularity) VALUES (?1, 'film', ?1, 2020, ?2)`,
      ).bind(id, 100 - i),
      env.DB.prepare(
        `INSERT INTO title_tags (title_id, tag_id, confidence, source)
         SELECT ?1, id, 1.0, 'seed' FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'`,
      ).bind(id),
    );
  }
  // Higher popularity than every tagged title, but never classified - the exact shape
  // of the titles PR #56 found live.
  for (let i = 0; i < 3; i++) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start, popularity) VALUES (?1, 'film', ?1, 2020, ?2)`,
      ).bind(`untagged-${i}`, 1000 - i),
    );
  }
  await env.DB.batch(statements);
});

describe("browseTitles", () => {
  it("fills the requested limit with qualifying titles even when higher-popularity ones are ungated", async () => {
    const hits = await browseTitles(env, {}, 5, 0);
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.titleId.startsWith("tagged-"))).toBe(true);
  });

  it("never returns an ungated title regardless of its popularity rank", async () => {
    const hits = await browseTitles(env, {}, 20, 0);
    expect(hits.some((h) => h.titleId.startsWith("untagged-"))).toBe(false);
  });
});

describe("browseTitles sort orders", () => {
  // Ids sort a < b < c; popularity, year and added date each order them differently, and
  // the tie pair (sort-b, sort-c) shares every value but the id.
  beforeAll(async () => {
    const rows: [string, string, number, number, string][] = [
      ["sort-a", "Zama", 50, 2017, "2026-01-01 00:00:00"],
      ["sort-b", "amores perros", 10, 2000, "2026-03-01 00:00:00"],
      ["sort-c", "Bacurau", 10, 2000, "2026-03-01 00:00:00"],
    ];
    await env.DB.batch(
      rows.flatMap(([id, title, popularity, year, createdAt]) => [
        env.DB.prepare(
          `INSERT INTO titles (id, kind, title, year_start, popularity, created_at) VALUES (?1, 'film', ?2, ?3, ?4, ?5)`,
        ).bind(id, title, year, popularity, createdAt),
        env.DB.prepare(
          `INSERT INTO title_tags (title_id, tag_id, confidence, source)
           SELECT ?1, id, 1.0, 'seed' FROM tags WHERE kind = 'inclusion_type' AND slug = 'led_by'`,
        ).bind(id),
      ]),
    );
  });

  const order = async (sort: "popular" | "added" | "year" | "title") =>
    (await browseTitles(env, { yearFrom: 2000, yearTo: 2017 }, 10, 0, sort)).map((h) => h.titleId);

  it("orders by popularity, then id for ties", async () => {
    expect(await order("popular")).toEqual(["sort-a", "sort-b", "sort-c"]);
  });

  it("orders newest-added first", async () => {
    expect(await order("added")).toEqual(["sort-b", "sort-c", "sort-a"]);
  });

  it("orders by release year, newest first", async () => {
    expect(await order("year")).toEqual(["sort-a", "sort-b", "sort-c"]);
  });

  it("orders A-Z by title, ignoring case", async () => {
    expect(await order("title")).toEqual(["sort-b", "sort-c", "sort-a"]);
  });
});
