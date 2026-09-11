import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Title } from "@latino-canon/core";
import app from "../index.js";

/**
 * Regression coverage for a real bug found in production: GET /titles/:id returned
 * {todo: "hydrate full Title", title: <raw row>} instead of a real Title, so the web
 * app's title.tags.filter(...) threw on undefined and crashed the whole page
 * ("Application error: a server-side exception has occurred").
 */

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO titles (id, tmdb_id, imdb_id, kind, title, original_title, year_start, year_end,
         countries, languages, synopsis, popularity, runtime)
       VALUES ('blue-beetle-2023', 293660, 'tt9362722', 'film', 'Blue Beetle', 'Blue Beetle',
         2023, NULL, '["US"]', '["en"]', 'Jaime Reyes finds an alien relic.', 12.0, 128)`,
    ),
    env.DB.prepare(
      `INSERT INTO people (id, tmdb_id, name, known_for_department) VALUES ('p1', 1, 'Ángel Manuel Soto', NULL)`,
    ),
    env.DB.prepare(
      `INSERT INTO credits (title_id, person_id, role, character, ord)
       VALUES ('blue-beetle-2023', 'p1', 'director', NULL, 0)`,
    ),
    // 'led_by' already exists - migration 0002 seeds the full tag vocabulary
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'blue-beetle-2023', id, 1.0, 'seed' FROM tags WHERE slug = 'led_by'`,
    ),
    env.DB.prepare(
      `INSERT INTO blurbs (title_id, text, sources, model, approved)
       VALUES ('blue-beetle-2023', 'A Latino-led superhero story.', '[{"kind":"synopsis","ref":"blue-beetle-2023","quote":null}]', 'test-model', 1)`,
    ),
    // unapproved blurb for a second title - proves the WHERE approved = 1 filter works
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages)
       VALUES ('unapproved-2020', 'film', 'Unapproved', 2020, '[]', '[]')`,
    ),
    env.DB.prepare(
      `INSERT INTO blurbs (title_id, text, sources, model, approved)
       VALUES ('unapproved-2020', 'Draft text.', '[]', 'test-model', 0)`,
    ),
  ]);
});

describe("GET /titles/:id", () => {
  it("hydrates the full Title shape, not the raw D1 row", async () => {
    const res = await app.request("/titles/blue-beetle-2023", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Title;

    expect(body.title).toBe("Blue Beetle");
    expect(body.country).toEqual(["US"]);
    expect(body.credits).toEqual([
      { person: { id: "p1", tmdbId: 1, name: "Ángel Manuel Soto", knownForDepartment: null }, role: "director", character: null, order: 0 },
    ]);
    expect(body.tags).toEqual([
      { kind: "inclusion_type", slug: "led_by", label: "Latino-directed", confidence: 1, source: "seed" },
    ]);
    expect(body.blurb?.text).toBe("A Latino-led superhero story.");
    expect(body.blurb?.approved).toBe(true);
  });

  it("omits an unapproved blurb", async () => {
    const res = await app.request("/titles/unapproved-2020", {}, env);
    const body = (await res.json()) as Title;
    expect(body.blurb).toBeNull();
  });

  it("404s for a title that doesn't exist", async () => {
    const res = await app.request("/titles/does-not-exist", {}, env);
    expect(res.status).toBe(404);
  });
});
