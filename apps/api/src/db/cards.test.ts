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
      `INSERT INTO people (id, tmdb_id, name, known_for_department, gender)
       VALUES ('p-ferrera', 101, 'America Ferrera', NULL, 'female')`,
    ),
    env.DB.prepare(
      `INSERT INTO people (id, tmdb_id, name, known_for_department, gender)
       VALUES ('p-costanzo', 102, 'George Lopez', NULL, 'male')`,
    ),
    // Two cast credits, out of ord order in the INSERT itself - hydrateCards must pick
    // the lowest `ord` (top-billed) as the lead, not just the first row returned.
    env.DB.prepare(
      `INSERT INTO credits (title_id, person_id, role, character, ord)
       VALUES ('real-women-have-curves-2002', 'p-costanzo', 'cast', NULL, 1)`,
    ),
    env.DB.prepare(
      `INSERT INTO credits (title_id, person_id, role, character, ord)
       VALUES ('real-women-have-curves-2002', 'p-ferrera', 'cast', NULL, 0)`,
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
    // Series credited only with a creator/showrunner, never a formal director role -
    // led_by's own definition treats that as equivalent primary creative control.
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages, popularity)
       VALUES ('ministry-of-time-2015', 'series', 'The Ministry of Time', 2015, '[]', '[]', 8)`,
    ),
    env.DB.prepare(
      `INSERT INTO people (id, tmdb_id, name, known_for_department, gender)
       VALUES ('p-olivares', 103, 'Javier Olivares', NULL, 'male')`,
    ),
    env.DB.prepare(
      `INSERT INTO credits (title_id, person_id, role, character, ord)
       VALUES ('ministry-of-time-2015', 'p-olivares', 'creator', NULL, 0)`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'ministry-of-time-2015', id, 1.0, 'seed' FROM tags WHERE slug = 'led_by'`,
    ),
    // genres/content_advisory fixtures - one of each value to prove hydrateCards parses
    // both the JSON array and the plain scalar column correctly.
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages, popularity, genres, content_advisory)
       VALUES ('animated-kids-title-2020', 'film', 'Animated Kids Title', 2020, '[]', '[]', 5, '["Animation","Family"]', 'general')`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'animated-kids-title-2020', id, 1.0, 'seed' FROM tags WHERE slug = 'led_by'`,
    ),
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages, popularity, content_advisory)
       VALUES ('mature-drama-2020', 'film', 'Mature Drama', 2020, '[]', '[]', 5, 'mature')`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'mature-drama-2020', id, 1.0, 'seed' FROM tags WHERE slug = 'led_by'`,
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

  it("carries the top-billed cast credit as the lead, not just whichever cast row comes back first", async () => {
    const [card] = await hydrateCards(env, [{ titleId: "real-women-have-curves-2002", score: 1 }]);
    expect(card?.leadActor).toBe("America Ferrera");
    expect(card?.leadActorGender).toBe("female");
  });

  it("excludes a title with no qualifying inclusion_type tag", async () => {
    const cards = await hydrateCards(env, [{ titleId: "untagged-2011", score: 1 }]);
    expect(cards).toEqual([]);
  });

  it("falls back to the creator credit as director when no director role is credited", async () => {
    const [card] = await hydrateCards(env, [{ titleId: "ministry-of-time-2015", score: 1 }]);
    expect(card?.director).toBe("Javier Olivares");
    expect(card?.directorGender).toBe("male");
  });

  it("parses the genres JSON array and passes contentAdvisory through", async () => {
    const [card] = await hydrateCards(env, [{ titleId: "animated-kids-title-2020", score: 1 }]);
    expect(card?.genres).toEqual(["Animation", "Family"]);
    expect(card?.contentAdvisory).toBe("general");
  });

  it("defaults to an empty genres array and null contentAdvisory when neither was ever set", async () => {
    const [card] = await hydrateCards(env, [{ titleId: "real-women-have-curves-2002", score: 1 }]);
    expect(card?.genres).toEqual([]);
    expect(card?.contentAdvisory).toBeNull();
  });

  it("passes contentAdvisory='mature' through unchanged", async () => {
    const [card] = await hydrateCards(env, [{ titleId: "mature-drama-2020", score: 1 }]);
    expect(card?.contentAdvisory).toBe("mature");
  });
});
