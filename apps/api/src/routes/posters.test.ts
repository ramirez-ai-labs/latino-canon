import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../index.js";

/**
 * Regression coverage for a real bug found in production: the web app's posterUrl()
 * builds "<api>/posters/<file>", but that route never existed - every poster 404'd.
 * apps/ingest/src/poster.ts stores objects at "posters/<file>" (the full key, matching
 * titles.poster_key); this route re-adds that prefix rather than trusting the URL path.
 */

beforeAll(async () => {
  await env.POSTERS.put("posters/blue-beetle-2023.jpg", new Blob(["fake-jpeg-bytes"]), {
    httpMetadata: { contentType: "image/jpeg" },
  });
});

describe("GET /posters/:file", () => {
  it("serves a cached poster with the right content-type", async () => {
    const res = await app.request("/posters/blue-beetle-2023.jpg", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(await res.text()).toBe("fake-jpeg-bytes");
  });

  it("404s for a poster that was never cached", async () => {
    const res = await app.request("/posters/no-such-title.jpg", {}, env);
    expect(res.status).toBe(404);
  });
});
