import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Title } from "@latino-canon/core";
import { persistTitle, setJob, writeAliases, writeBlurb, writeContentAdvisory, writeTags } from "./persist.js";

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "test-title-2020",
    tmdbId: 1,
    imdbId: "tt0000001",
    kind: "film",
    title: "Test Title",
    originalTitle: "Test Title",
    yearStart: 2020,
    yearEnd: null,
    country: ["US"],
    language: ["en"],
    synopsis: "A test synopsis.",
    posterKey: null,
    popularity: 5,
    runtime: 100,
    credits: [],
    tags: [],
    blurb: null,
    representationHandling: null,
    contextNotes: [],
    oscarWin: null,
    genres: [],
    contentAdvisory: null,
    ...overrides,
  };
}

// Fresh, migrated D1 per test file (see src/test/apply-migrations.ts) - not per test,
// so each test uses its own title id to avoid cross-test collisions within a file.

describe("persistTitle", () => {
  it("inserts a new title row", async () => {
    await persistTitle(env, makeTitle({ id: "persist-insert-2020" }));
    const row = await env.DB.prepare("SELECT * FROM titles WHERE id = ?").bind("persist-insert-2020").first();
    expect(row?.title).toBe("Test Title");
    expect(row?.popularity).toBe(5);
  });

  it("re-persisting the same id updates synopsis/popularity, not the original insert-only fields", async () => {
    await persistTitle(env, makeTitle({ id: "persist-upsert-2020" }));
    await persistTitle(env, makeTitle({ id: "persist-upsert-2020", synopsis: "Updated synopsis.", popularity: 9 }));
    const row = await env.DB.prepare("SELECT * FROM titles WHERE id = ?").bind("persist-upsert-2020").first();
    expect(row?.synopsis).toBe("Updated synopsis.");
    expect(row?.popularity).toBe(9);
  });

  it("replaces credits on re-persist rather than accumulating duplicates", async () => {
    const person = (id: string, name: string) => ({
      id,
      tmdbId: null,
      name,
      knownForDepartment: null,
      gender: null,
    });
    await persistTitle(
      env,
      makeTitle({
        id: "persist-credits-2020",
        credits: [{ person: person("p1", "First Director"), role: "director", character: null, order: 0 }],
      }),
    );
    await persistTitle(
      env,
      makeTitle({
        id: "persist-credits-2020",
        credits: [{ person: person("p2", "Second Director"), role: "director", character: null, order: 0 }],
      }),
    );
    const { results } = await env.DB.prepare("SELECT person_id FROM credits WHERE title_id = ?")
      .bind("persist-credits-2020")
      .all();
    expect(results).toHaveLength(1);
    expect(results[0]?.person_id).toBe("p2");
  });

  it("rebuilds the FTS index entry so the title becomes lexically searchable", async () => {
    await persistTitle(env, makeTitle({ id: "persist-fts-2020", title: "Zorro Unmistakable" }));
    const row = await env.DB.prepare("SELECT rowid FROM titles_fts WHERE titles_fts MATCH 'Zorro'").first();
    expect(row).not.toBeNull();
  });
});

describe("writeTags", () => {
  it("skips writing anything when neither seed nor model provides a valid inclusion type", async () => {
    await persistTitle(env, makeTitle({ id: "tags-skip-2020" }));
    await writeTags(env, "tags-skip-2020", {
      classification: { inclusionTypes: [], themes: [] },
      seedInclusionTypes: [],
    });
    const { results } = await env.DB.prepare("SELECT * FROM title_tags WHERE title_id = ?")
      .bind("tags-skip-2020")
      .all();
    expect(results).toHaveLength(0);
  });

  it("writes a seed-sourced inclusion type at full confidence", async () => {
    await persistTitle(env, makeTitle({ id: "tags-seed-2020" }));
    await writeTags(env, "tags-seed-2020", {
      classification: { inclusionTypes: [], themes: [] },
      seedInclusionTypes: ["led_by"],
    });
    const row = await env.DB.prepare(
      `SELECT tt.confidence, tt.source FROM title_tags tt
       JOIN tags g ON g.id = tt.tag_id WHERE tt.title_id = ? AND g.slug = 'led_by'`,
    )
      .bind("tags-seed-2020")
      .first<{ confidence: number; source: string }>();
    expect(row).toEqual({ confidence: 1, source: "seed" });
  });

  it("writes a model-sourced inclusion type at its own confidence", async () => {
    await persistTitle(env, makeTitle({ id: "tags-model-2020" }));
    await writeTags(env, "tags-model-2020", {
      classification: { inclusionTypes: [{ type: "starring", confidence: 0.75 }], themes: [] },
      seedInclusionTypes: [],
    });
    const row = await env.DB.prepare(
      `SELECT tt.confidence, tt.source FROM title_tags tt
       JOIN tags g ON g.id = tt.tag_id WHERE tt.title_id = ? AND g.slug = 'starring'`,
    )
      .bind("tags-model-2020")
      .first<{ confidence: number; source: string }>();
    expect(row).toEqual({ confidence: 0.75, source: "model" });
  });

  it("precedence: a later model classification never downgrades an existing seed tag", async () => {
    // This is the entire point of writeTags's ON CONFLICT guard - editor > seed >
    // model, enforced by precedence, not write order. A re-ingest (e.g. a metadata
    // fix unrelated to classification) must not let the model overwrite a trusted
    // seed call just because it ran again.
    await persistTitle(env, makeTitle({ id: "tags-precedence-2020" }));
    await writeTags(env, "tags-precedence-2020", {
      classification: { inclusionTypes: [], themes: [] },
      seedInclusionTypes: ["led_by"],
    });
    await writeTags(env, "tags-precedence-2020", {
      classification: { inclusionTypes: [{ type: "led_by", confidence: 0.3 }], themes: [] },
      seedInclusionTypes: [],
    });
    const row = await env.DB.prepare(
      `SELECT tt.confidence, tt.source FROM title_tags tt
       JOIN tags g ON g.id = tt.tag_id WHERE tt.title_id = ? AND g.slug = 'led_by'`,
    )
      .bind("tags-precedence-2020")
      .first<{ confidence: number; source: string }>();
    expect(row).toEqual({ confidence: 1, source: "seed" });
  });
});

describe("writeBlurb", () => {
  const blurb = (text: string) => ({
    result: { text, claims: [] },
    sources: [],
    model: "test-model",
  });

  it("a new blurb starts unapproved", async () => {
    await persistTitle(env, makeTitle({ id: "blurb-new-2020" }));
    await writeBlurb(env, "blurb-new-2020", blurb("Original text that is long enough to pass validation."));
    const row = await env.DB.prepare("SELECT approved FROM blurbs WHERE title_id = ?")
      .bind("blurb-new-2020")
      .first<{ approved: number }>();
    expect(row?.approved).toBe(0);
  });

  it("regression test for #138: re-writing identical text/sources preserves an existing approval", async () => {
    await persistTitle(env, makeTitle({ id: "blurb-preserve-2020" }));
    const text = "Approved text that is long enough to pass validation checks.";
    await writeBlurb(env, "blurb-preserve-2020", blurb(text));
    await env.DB.prepare("UPDATE blurbs SET approved = 1 WHERE title_id = ?").bind("blurb-preserve-2020").run();

    // Re-ingest with byte-for-byte identical text/sources (e.g. an unrelated
    // metadata fix that re-runs the same blurb generation).
    await writeBlurb(env, "blurb-preserve-2020", blurb(text));

    const row = await env.DB.prepare("SELECT approved FROM blurbs WHERE title_id = ?")
      .bind("blurb-preserve-2020")
      .first<{ approved: number }>();
    expect(row?.approved).toBe(1);
  });

  it("re-writing genuinely different text resets approval", async () => {
    await persistTitle(env, makeTitle({ id: "blurb-reset-2020" }));
    await writeBlurb(
      env,
      "blurb-reset-2020",
      blurb("Original approved text that is long enough to pass validation."),
    );
    await env.DB.prepare("UPDATE blurbs SET approved = 1 WHERE title_id = ?").bind("blurb-reset-2020").run();

    await writeBlurb(
      env,
      "blurb-reset-2020",
      blurb("A genuinely different regenerated blurb text, long enough too."),
    );

    const row = await env.DB.prepare("SELECT approved FROM blurbs WHERE title_id = ?")
      .bind("blurb-reset-2020")
      .first<{ approved: number }>();
    expect(row?.approved).toBe(0);
  });
});

describe("writeAliases", () => {
  it("indexes an alias into titles_fts so it becomes lexically searchable", async () => {
    await persistTitle(env, makeTitle({ id: "alias-index-2020", title: "Original Title Here" }));
    await writeAliases(env, "alias-index-2020", [{ alias: "Totally Different Name", kind: "translation" }]);

    const row = await env.DB.prepare(
      "SELECT rowid FROM titles_fts WHERE titles_fts MATCH 'Totally'",
    ).first();
    expect(row).not.toBeNull();
  });

  it("stores the alias row with its kind", async () => {
    await persistTitle(env, makeTitle({ id: "alias-kind-2020" }));
    await writeAliases(env, "alias-kind-2020", [{ alias: "A Common Misspelling", kind: "misspelling" }]);

    const row = await env.DB.prepare("SELECT alias, kind FROM title_aliases WHERE title_id = ?")
      .bind("alias-kind-2020")
      .first<{ alias: string; kind: string }>();
    expect(row).toEqual({ alias: "A Common Misspelling", kind: "misspelling" });
  });

  it("overwrites rather than appends - re-running with a shorter list drops the old aliases from title_aliases", async () => {
    await persistTitle(env, makeTitle({ id: "alias-overwrite-2020" }));
    await writeAliases(env, "alias-overwrite-2020", [
      { alias: "First Alias", kind: "alt_title" },
      { alias: "Second Alias", kind: "nickname" },
    ]);
    await writeAliases(env, "alias-overwrite-2020", [{ alias: "Second Alias", kind: "nickname" }]);

    const { results } = await env.DB.prepare("SELECT alias FROM title_aliases WHERE title_id = ?")
      .bind("alias-overwrite-2020")
      .all<{ alias: string }>();
    expect(results.map((r) => r.alias)).toEqual(["Second Alias"]);
  });

  it("a later persistTitle re-index doesn't clobber aliases written separately", async () => {
    // Regression case: persistTitle's own FTS rebuild reads aliases live from
    // title_aliases (not from the in-memory Title, which has no alias field) - an
    // unrelated metadata re-ingest must not silently drop a title's aliases.
    await persistTitle(env, makeTitle({ id: "alias-survives-reingest-2020" }));
    await writeAliases(env, "alias-survives-reingest-2020", [{ alias: "Surviving Alias", kind: "translation" }]);
    await persistTitle(env, makeTitle({ id: "alias-survives-reingest-2020", synopsis: "Updated synopsis." }));

    const row = await env.DB.prepare(
      "SELECT rowid FROM titles_fts WHERE titles_fts MATCH 'Surviving'",
    ).first();
    expect(row).not.toBeNull();
  });
});

describe("setJob", () => {
  it("stores the params JSON passed at creation", async () => {
    const params = { ref: "Test (2020)", title: "Test", year: 2020, kind: "film" as const };
    await setJob(env, "job-params-1", params.ref, "resolve", "running", null, params);
    const row = await env.DB.prepare("SELECT params FROM ingest_jobs WHERE id = ?")
      .bind("job-params-1")
      .first<{ params: string }>();
    expect(JSON.parse(row!.params)).toEqual(params);
  });

  it("preserves stored params across later status updates that don't pass params", async () => {
    const params = { ref: "Test (2020)", title: "Test", year: 2020, kind: "film" as const };
    await setJob(env, "job-params-2", params.ref, "resolve", "running", null, params);
    // Every later call in a real workflow run omits params - only "register job" sets it.
    await setJob(env, "job-params-2", params.ref, "classify", "running");
    await setJob(env, "job-params-2", params.ref, "review", "done");

    const row = await env.DB.prepare("SELECT params, stage, status FROM ingest_jobs WHERE id = ?")
      .bind("job-params-2")
      .first<{ params: string; stage: string; status: string }>();
    expect(JSON.parse(row!.params)).toEqual(params);
    expect(row!.stage).toBe("review");
    expect(row!.status).toBe("done");
  });

  it("a job with no stored params (pre-migration row) reads back as null, not a JSON error", async () => {
    await setJob(env, "job-no-params", "Test (2020)", "resolve", "error", "boom");
    const row = await env.DB.prepare("SELECT params FROM ingest_jobs WHERE id = ?")
      .bind("job-no-params")
      .first<{ params: string | null }>();
    expect(row?.params).toBeNull();
  });
});

describe("writeContentAdvisory", () => {
  it("writes the rating to titles.content_advisory", async () => {
    await persistTitle(env, makeTitle({ id: "advisory-general-2020" }));
    await writeContentAdvisory(env, "advisory-general-2020", "general");
    const row = await env.DB.prepare("SELECT content_advisory FROM titles WHERE id = ?")
      .bind("advisory-general-2020")
      .first<{ content_advisory: string }>();
    expect(row?.content_advisory).toBe("general");
  });

  it("unconditionally overwrites a previous rating on re-classification", async () => {
    await persistTitle(env, makeTitle({ id: "advisory-flip-2020" }));
    await writeContentAdvisory(env, "advisory-flip-2020", "general");
    await writeContentAdvisory(env, "advisory-flip-2020", "mature");
    const row = await env.DB.prepare("SELECT content_advisory FROM titles WHERE id = ?")
      .bind("advisory-flip-2020")
      .first<{ content_advisory: string }>();
    expect(row?.content_advisory).toBe("mature");
  });

  it("never touches title_tags - a scalar column write, not a tag upsert", async () => {
    await persistTitle(env, makeTitle({ id: "advisory-no-tags-2020" }));
    await writeContentAdvisory(env, "advisory-no-tags-2020", "general");
    const { results } = await env.DB.prepare("SELECT * FROM title_tags WHERE title_id = ?")
      .bind("advisory-no-tags-2020")
      .all();
    expect(results).toEqual([]);
  });
});
