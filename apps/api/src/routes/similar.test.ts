import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../bindings.js";
import app from "../index.js";
import type { SimilarResponse } from "./titles.js";

// Five titles: four in the canon (a seed inclusion tag), one ingested but untagged, which
// the visibility gate must keep off the page and out of everyone's neighbors.
const CANON = ["coco-2017", "encanto-2021", "the-book-of-life-2014", "vivo-2021"];
const UNTAGGED = "untagged-2020";

beforeAll(async () => {
  await env.DB.batch([
    ...[...CANON, UNTAGGED].map((id) =>
      env.DB.prepare(
        `INSERT INTO titles (id, kind, title, year_start, countries, languages) VALUES (?1, 'film', ?1, 2020, '[]', '[]')`,
      ).bind(id),
    ),
    ...CANON.map((id) =>
      env.DB.prepare(
        `INSERT INTO title_tags (title_id, tag_id, confidence, source) SELECT ?1, id, 1.0, 'seed' FROM tags WHERE slug = 'about_community'`,
      ).bind(id),
    ),
  ]);
});

/** A Vectorize whose queryById answers from a fixed neighbor list, counting calls. */
function withVectorize(queryById: (id: string) => Promise<{ matches: { id: string; score: number }[] }>) {
  const calls: string[] = [];
  const testEnv = {
    ...env,
    VECTORIZE: {
      queryById: async (id: string) => {
        calls.push(id);
        return queryById(id);
      },
    },
  } as unknown as Env;
  return { testEnv, calls };
}

async function get(path: string, testEnv: Env) {
  const ctx = createExecutionContext();
  const res = await app.request(path, {}, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const neighbors = () =>
  Promise.resolve({
    matches: [
      { id: "coco-2017", score: 1.0 }, // itself - always its own nearest neighbor
      { id: "encanto-2021", score: 0.7 },
      { id: UNTAGGED, score: 0.68 },
      { id: "the-book-of-life-2014", score: 0.66 },
      { id: "vivo-2021", score: 0.42 }, // below MIN_SIMILAR_SCORE
    ],
  });

describe("GET /titles/:id/similar", () => {
  it("returns canon neighbors by score, without the title itself, untagged titles, or weak matches", async () => {
    const { testEnv } = withVectorize(neighbors);
    const res = await get("/titles/coco-2017/similar", testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<SimilarResponse>();
    expect(body.titleId).toBe("coco-2017");
    expect(body.results.map((r) => r.id)).toEqual(["encanto-2021", "the-book-of-life-2014"]);
    expect(body.results[0]!.score).toBe(0.7);
  });

  it("respects limit", async () => {
    const { testEnv } = withVectorize(neighbors);
    const body = await (await get("/titles/coco-2017/similar?limit=1", testEnv)).json<SimilarResponse>();
    expect(body.results.map((r) => r.id)).toEqual(["encanto-2021"]);
  });

  it("serves a repeat request from the cache without querying Vectorize again", async () => {
    const { testEnv, calls } = withVectorize(neighbors);
    await get("/titles/encanto-2021/similar?limit=3", testEnv);
    await get("/titles/encanto-2021/similar?limit=3", testEnv);
    expect(calls).toEqual(["encanto-2021"]);
  });

  it("404s for a title outside the canon, without querying Vectorize", async () => {
    const { testEnv, calls } = withVectorize(neighbors);
    expect((await get(`/titles/${UNTAGGED}/similar`, testEnv)).status).toBe(404);
    expect((await get("/titles/no-such-title/similar", testEnv)).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("returns no neighbors, not a 500, for a title with no vector yet", async () => {
    const { testEnv } = withVectorize(() => Promise.reject(new Error("VECTOR_ID_NOT_FOUND")));
    const res = await get("/titles/vivo-2021/similar", testEnv);
    expect(res.status).toBe(200);
    expect((await res.json<SimilarResponse>()).results).toEqual([]);
  });
});
