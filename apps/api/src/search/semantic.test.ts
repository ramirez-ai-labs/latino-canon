import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../bindings.js";
import { keepMatchingD1, semanticSearch } from "./semantic.js";

/**
 * Regression for a live bug: semantic search pushed country/theme/inclusionType down to
 * Vectorize as `{ $eq: value }`, but those are array-valued metadata (a title can have
 * more than one) and Vectorize has no "array contains" operator - `$eq` against an array
 * never matches, so semantic search + any of these three filters always returned zero
 * results even when plenty of candidates should have matched. `keepMatchingD1` re-checks
 * Vectorize's candidate ids against the real D1 tables instead, using the same
 * `filterToSql` WHERE that `lexicalSearch` already filters correctly by.
 */

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries) VALUES ('under-the-same-moon-2007', 'film', 'Under the Same Moon', 2007, '["MX","US","FR"]')`,
    ),
    env.DB.prepare(
      `INSERT INTO titles (id, kind, title, year_start, countries) VALUES ('my-family-1995', 'film', 'My Family', 1995, '["US"]')`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'under-the-same-moon-2007', id, 1.0, 'seed' FROM tags WHERE kind = 'theme' AND slug = 'family'`,
    ),
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       SELECT 'my-family-1995', id, 1.0, 'seed' FROM tags WHERE kind = 'theme' AND slug = 'family'`,
    ),
  ]);
});

describe("keepMatchingD1", () => {
  it("drops a Vectorize candidate whose countries array doesn't contain the filter value", async () => {
    const hits = [
      { titleId: "under-the-same-moon-2007", score: 0.9 },
      { titleId: "my-family-1995", score: 0.8 },
    ];
    const kept = await keepMatchingD1(env, hits, { country: "MX" });
    expect(kept.map((h) => h.titleId)).toEqual(["under-the-same-moon-2007"]);
  });

  it("keeps candidates whose theme tag matches", async () => {
    const hits = [
      { titleId: "under-the-same-moon-2007", score: 0.9 },
      { titleId: "my-family-1995", score: 0.8 },
    ];
    const kept = await keepMatchingD1(env, hits, { theme: "family" });
    expect(kept.map((h) => h.titleId).sort()).toEqual(["my-family-1995", "under-the-same-moon-2007"]);
  });

  it("returns nothing left over when no candidate matches", async () => {
    const hits = [{ titleId: "my-family-1995", score: 0.8 }];
    const kept = await keepMatchingD1(env, hits, { country: "MX" });
    expect(kept).toEqual([]);
  });
});

describe("semanticSearch (score floor)", () => {
  // The actual bug this guards: with no minimum score, an off-topic query like "DC
  // comics" returned 14 of 16 titles - Vectorize always returns its topK nearest
  // neighbors by cosine distance, however weak the match, so a small catalog has no
  // natural "nothing matched" case without a floor.
  function fakeEnv(scores: number[]): Env {
    return {
      ...env,
      AI: { run: async () => ({ data: [[0, 0, 0]] }) },
      VECTORIZE: {
        query: async () => ({
          matches: scores.map((score, i) => ({ id: `title-${i}`, score })),
        }),
      },
    } as unknown as Env;
  }

  it("drops matches below the minimum score", async () => {
    const hits = await semanticSearch(fakeEnv([0.6, 0.4, 0.2, 0.1]), "some query", {}, 10);
    expect(hits.map((h) => h.score)).toEqual([0.6, 0.4]);
  });

  it("returns nothing when every candidate is below the floor", async () => {
    const hits = await semanticSearch(fakeEnv([0.3, 0.2]), "off-topic query", {}, 10);
    expect(hits).toEqual([]);
  });
});
