import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hydrateCards } from "./cards.js";

/**
 * hydrateCards backs every card-based surface (search, browse, catalog, collections) —
 * this covers the two things that surface changed for: a title's directorGender flows
 * through for led_by's gendered label, and the inclusion_type visibility gate (the
 * "No Strings Attached" fix) actually excludes an untagged title from the result set.
 */
beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages, popularity)
       VALUES ('real-women-have-curves-2002', 'film', 'Real Women Have Curves', 2002, '[]', '[]', 5)`,
    ),
    env.DB.prepare(
      `INSERT INTO people (id, tmdb_id, name, known_for_department, gender)
       VALUES ('p-cardoso', 100, 'Patricia Cardoso', NULL, 'female')`,
    ),
    env.DB.prepare(
      `INSERT INTO credits (title_id, person_id, role, character, ord)
       VALUES ('real-women-have-curves-2002', 'p-cardoso', 'director', NULL, 0)`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'real-women-have-curves-2002', id, 1.0, 'seed' FROM tags WHERE slug = 'led_by'`,
    ),
    // Persisted, has credits, but never classified — the exact "No Strings Attached" shape.
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages, popularity)
       VALUES ('untagged-2011', 'film', 'Untagged', 2011, '[]', '[]', 15)`,
    ),
  ]);
});

describe("hydrateCards", () => {
  it("carries the director's gender through for a female-directed title", async () => {
    const [card] = await hydrateCards(env, [{ titleId: "real-women-have-curves-2002", score: 1 }]);
    expect(card?.director).toBe("Patricia Cardoso");
    expect(card?.directorGender).toBe("female");
    expect(card?.inclusionTypes).toEqual(["led_by"]);
  });

  it("excludes a title with no qualifying inclusion_type tag", async () => {
    const cards = await hydrateCards(env, [{ titleId: "untagged-2011", score: 1 }]);
    expect(cards).toEqual([]);
  });
});
