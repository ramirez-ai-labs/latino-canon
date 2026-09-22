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
      `INSERT INTO people (id, tmdb_id, name, known_for_department, gender) VALUES ('p1', 1, 'Ángel Manuel Soto', NULL, 'male')`,
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
    // unapproved blurb for a second title - proves auto-approval works (returns all blurbs)
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages)
       VALUES ('unapproved-2020', 'film', 'Unapproved', 2020, '[]', '[]')`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'unapproved-2020', id, 1.0, 'seed' FROM tags WHERE slug = 'led_by'`,
    ),
    env.DB.prepare(
      `INSERT INTO blurbs (title_id, text, sources, model, approved)
       VALUES ('unapproved-2020', 'Draft text.', '[]', 'test-model', 0)`,
    ),
    // representation_handling + context notes - one public (should be returned), one
    // curator_only (should never reach this public endpoint)
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages, representation_handling)
       VALUES ('contextual-2020', 'film', 'Contextual Example', 2020, '[]', '[]', 'contextual')`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'contextual-2020', id, 1.0, 'seed' FROM tags WHERE slug = 'led_by'`,
    ),
    env.DB.prepare(
      `INSERT INTO title_context_notes (title_id, category, status, summary, sources, display_policy)
       VALUES ('contextual-2020', 'crime_stereotype_risk', 'confirmed', 'A public note.',
         '[{"kind":"criticism","ref":"https://example.com","quote":null}]', 'public')`,
    ),
    env.DB.prepare(
      `INSERT INTO title_context_notes (title_id, category, status, summary, sources, display_policy)
       VALUES ('contextual-2020', 'authorship_gap', 'review_required', 'A curator-only note.', '[]', 'curator_only')`,
    ),
    // no title_tags row at all - the "No Strings Attached" shape found live in
    // production: fully persisted (title + credits can exist) but never classified,
    // so it must not be publicly reachable even by direct id.
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages)
       VALUES ('untagged-2011', 'film', 'Untagged', 2011, '[]', '[]')`,
    ),
    // has a tag, but a 'model' tag below MODEL_TAG_DISPLAY_THRESHOLD doesn't count -
    // same bar as whether the tag itself is trusted enough to display.
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries, languages)
       VALUES ('low-confidence-2015', 'film', 'Low Confidence', 2015, '[]', '[]')`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'low-confidence-2015', id, 0.4, 'model' FROM tags WHERE slug = 'led_by'`,
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
      { person: { id: "p1", tmdbId: 1, name: "Ángel Manuel Soto", knownForDepartment: null, gender: "male" }, role: "director", character: null, order: 0 },
    ]);
    expect(body.tags).toEqual([
      { kind: "inclusion_type", slug: "led_by", label: "Latino-directed", confidence: 1, source: "seed" },
    ]);
    expect(body.blurb?.text).toBe("A Latino-led superhero story.");
    expect(body.blurb?.approved).toBe(true);
  });

  it("returns an unapproved blurb (auto-approved)", async () => {
    const res = await app.request("/titles/unapproved-2020", {}, env);
    const body = (await res.json()) as Title;
    expect(body.blurb?.text).toBe("Draft text.");
    expect(body.blurb?.approved).toBe(false);
  });

  it("404s for a title that doesn't exist", async () => {
    const res = await app.request("/titles/does-not-exist", {}, env);
    expect(res.status).toBe(404);
  });

  it("returns representationHandling and only public context notes", async () => {
    const res = await app.request("/titles/contextual-2020", {}, env);
    const body = (await res.json()) as Title;

    expect(body.representationHandling).toBe("contextual");
    expect(body.contextNotes).toHaveLength(1);
    expect(body.contextNotes[0]).toEqual({
      category: "crime_stereotype_risk",
      status: "confirmed",
      summary: "A public note.",
      sources: [{ kind: "criticism", ref: "https://example.com", quote: null }],
      displayPolicy: "public",
    });
  });

  it("defaults representationHandling to null and contextNotes to [] for a standard title", async () => {
    const res = await app.request("/titles/blue-beetle-2023", {}, env);
    const body = (await res.json()) as Title;

    expect(body.representationHandling).toBeNull();
    expect(body.contextNotes).toEqual([]);
  });

  // Regression coverage for a real bug found live in production: a title with no
  // qualifying inclusion_type tag was fully reachable (browsable and directly
  // addressable), even though taxonomy.ts states a title only belongs in the canon
  // once it earns >= 1 inclusion_type tag. See db/cards.ts for the same gate applied
  // to search/browse/collections.
  it("404s for a persisted title with no inclusion_type tag at all", async () => {
    const res = await app.request("/titles/untagged-2011", {}, env);
    expect(res.status).toBe(404);
  });

  it("404s for a title whose only tag is a model tag below the display threshold", async () => {
    const res = await app.request("/titles/low-confidence-2015", {}, env);
    expect(res.status).toBe(404);
  });
});

describe("GET /titles", () => {
  // Regression coverage for a real bug found live in production, on both the plain
  // no-params call AND ?recent=1: the !hasBlurb branch selected `FROM titles` with no
  // `t` alias, so every `t.`-qualified ORDER BY column - the default `t.title ASC`, not
  // just `t.created_at DESC` for recent=1 - never resolved, 500ing every time
  // ("no such column: t.title"/"t.created_at"). hasBlurb=1's branch already aliases
  // `titles t`, which is why the groundedness eval's own GET /titles?hasBlurb=1 calls
  // were never affected. created_at itself was never actually missing - confirmed via
  // a direct `wrangler d1 execute` against the live table - that was a wrong first
  // diagnosis based on an error message that looks identical for either cause.
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start, countries, languages, created_at)
         VALUES ('recent-older-2020', 'film', 'Older', 2020, '[]', '[]', '2020-01-01T00:00:00Z')`,
      ),
      env.DB.prepare(
        // Far-future, not just "later than the other row" - every other title in this
        // file defaults created_at to the real wall-clock time the test runs, which
        // would otherwise sort ahead of any plausible hand-picked "recent" date.
        `INSERT INTO titles (id, kind, title, year_start, countries, languages, created_at)
         VALUES ('recent-newer-2021', 'film', 'Newer', 2021, '[]', '[]', '2099-01-01T00:00:00Z')`,
      ),
    ]);
  });

  it("plain call (no query params) doesn't 500 on the missing FROM titles alias", async () => {
    const res = await app.request("/titles?limit=100", {}, env);
    expect(res.status).toBe(200);
  });

  it("?recent=1 orders by created_at DESC", async () => {
    const res = await app.request("/titles?recent=1&limit=100", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ titleIds: string[] }>();
    // recent-newer-2021's far-future date guarantees first place outright. Everything
    // else in this file defaults created_at to the real wall-clock test-run time, which
    // is later than recent-older-2020's 2020 date - so only relative order between the
    // two is asserted, not recent-older-2020's absolute position.
    expect(body.titleIds[0]).toBe("recent-newer-2021");
    expect(body.titleIds.indexOf("recent-newer-2021")).toBeLessThan(body.titleIds.indexOf("recent-older-2020"));
  });
});
