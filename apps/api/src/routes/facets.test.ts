import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogFacets } from "@latino-canon/core";
import app from "../index.js";
import { catalogFacets } from "./titles.js";

function title(id: string, year: number, countries: string[]) {
  return env.DB.prepare(
    `INSERT INTO titles (id, kind, title, year_start, countries, languages) VALUES (?1, 'film', ?1, ?2, ?3, '[]')`,
  ).bind(id, year, JSON.stringify(countries));
}

function tag(id: string, source: "seed" | "model", confidence: number) {
  return env.DB.prepare(
    `INSERT INTO title_tags (title_id, tag_id, confidence, source) SELECT ?1, id, ?2, ?3 FROM tags WHERE slug = 'led_by'`,
  ).bind(id, confidence, source);
}

beforeAll(async () => {
  await env.DB.batch([
    title("blood-of-the-condor-1969", 1969, ["BO"]),
    tag("blood-of-the-condor-1969", "seed", 1),
    title("limite-1931", 1931, ["BR"]),
    tag("limite-1931", "seed", 1),
    // A co-production counts once under each of its countries.
    title("whisky-2004", 2004, ["UY", "AR"]),
    tag("whisky-2004", "seed", 1),
    title("clara-sola-2021", 2021, ["CR", "BO"]),
    tag("clara-sola-2021", "seed", 1),
    // Outside the canon (no inclusion_type, or only a low-confidence model one): search
    // can't return these, so they must not create filter options.
    title("unclassified-2020", 2020, ["PY"]),
    title("low-confidence-1955", 1955, ["NI"]),
    tag("low-confidence-1955", "model", 0.1),
    // A malformed country value never becomes an option.
    title("bad-country-2010", 2010, ["USA", ""]),
    tag("bad-country-2010", "seed", 1),
  ]);
});

describe("catalog facets", () => {
  it("counts canon titles per production country and decade, and nothing outside the canon", async () => {
    const f = await catalogFacets(env);
    const countries = Object.fromEntries(f.countries.map((c) => [c.code, c.count]));
    expect(countries).toEqual({ BO: 2, BR: 1, UY: 1, AR: 1, CR: 1 });
    const decades = Object.fromEntries(f.decades.map((d) => [d.decade, d.count]));
    expect(decades).toEqual({ 1930: 1, 1960: 1, 2000: 1, 2010: 1, 2020: 1 });
  });

  it("serves them at GET /titles/facets, not as a title id", async () => {
    const res = await app.request("/titles/facets", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<CatalogFacets>();
    expect(body.countries.map((c) => c.code).sort()).toEqual(["AR", "BO", "BR", "CR", "UY"]);
    expect(body.decades.map((d) => d.decade).sort()).toEqual([1930, 1960, 2000, 2010, 2020]);
  });
});
