import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { browseByPopularity } from "./browse.js";

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

describe("browseByPopularity", () => {
  it("fills the requested limit with qualifying titles even when higher-popularity ones are ungated", async () => {
    const hits = await browseByPopularity(env, {}, 5, 0);
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.titleId.startsWith("tagged-"))).toBe(true);
  });

  it("never returns an ungated title regardless of its popularity rank", async () => {
    const hits = await browseByPopularity(env, {}, 20, 0);
    expect(hits.some((h) => h.titleId.startsWith("untagged-"))).toBe(false);
  });
});
