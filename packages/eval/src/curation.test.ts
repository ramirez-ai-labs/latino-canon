import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GENRES, THEMES } from "@latino-canon/core";
import { describe, expect, it } from "vitest";
import { checkConstraint, scoreCase, summarize, type CurationCase, type PickFacts } from "./curation.js";

const pick = (over: Partial<PickFacts> = {}): PickFacts => ({
  id: "x",
  kind: "film",
  yearStart: 2015,
  directorGender: "female",
  genres: ["Documentary"],
  contentAdvisory: "general",
  themes: ["immigration"],
  countries: ["CO"],
  ...over,
});

describe("checkConstraint", () => {
  it("compares each constraint with the pick's metadata", () => {
    expect(checkConstraint("directorGender", "female", pick())).toBe("met");
    expect(checkConstraint("directorGender", "female", pick({ directorGender: "male" }))).toBe("failed");
    expect(checkConstraint("kind", "series", pick())).toBe("failed");
    expect(checkConstraint("country", "CO", pick({ countries: ["ES", "CO"] }))).toBe("met");
    expect(checkConstraint("genre", "Documentary", pick())).toBe("met");
    expect(checkConstraint("contentAdvisory", "general", pick({ contentAdvisory: "mature" }))).toBe("failed");
    expect(checkConstraint("theme", "immigration", pick())).toBe("met");
  });

  it("reads decade as release year, 1960 meaning 1960-1969", () => {
    expect(checkConstraint("decade", 1960, pick({ yearStart: 1960 }))).toBe("met");
    expect(checkConstraint("decade", 1960, pick({ yearStart: 1969 }))).toBe("met");
    expect(checkConstraint("decade", 1960, pick({ yearStart: 1970 }))).toBe("failed");
  });

  it("reports unknown, not failed, when the catalog has nothing to check", () => {
    expect(checkConstraint("directorGender", "female", pick({ directorGender: null }))).toBe("unknown");
    expect(checkConstraint("country", "CO", pick({ countries: null }))).toBe("unknown");
    expect(checkConstraint("genre", "Documentary", pick({ genres: [] }))).toBe("unknown");
    expect(checkConstraint("contentAdvisory", "general", pick({ contentAdvisory: null }))).toBe("unknown");
  });
});

describe("scoreCase", () => {
  const c: CurationCase = { id: "c", request: "female directed documentaries", constraints: { directorGender: "female", genre: "Documentary" }, available: 10 };

  // The 2026-09-30 v1 failure this eval exists for: a pick can match one constraint and miss another.
  it("counts a pick only when it meets every constraint, and an unknown as not met", () => {
    const r = scoreCase(c, [pick({ id: "a" }), pick({ id: "b", directorGender: "male" }), pick({ id: "c", directorGender: null }), pick({ id: "d", genres: ["Drama"] })]);
    expect(r.picks.map((p) => p.meetsAll)).toEqual([true, false, false, false]);
    expect(r.precision).toBe(0.25);
    expect(r.picks[2]!.verdicts).toEqual({ directorGender: "unknown", genre: "met" });
  });

  it("gives no precision, rather than 0 or 1, for a case with no picks", () => {
    expect(scoreCase(c, []).precision).toBeNull();
  });
});

describe("summarize", () => {
  it("pools picks for the headline, averages cases for casePrecision, and reports each constraint", () => {
    const a: CurationCase = { id: "a", request: "…", constraints: { kind: "film" }, available: 5 };
    const b: CurationCase = { id: "b", request: "…", constraints: { kind: "film", directorGender: "female" }, available: 5 };
    const results = [
      scoreCase(a, [pick(), pick(), pick(), pick()]), // 4 of 4
      scoreCase(b, [pick({ directorGender: "male" }), pick({ directorGender: null })]), // 0 of 2
      scoreCase(a, []),
    ];
    const s = summarize(results);
    expect(s).toMatchObject({ cases: 3, picks: 6, precision: 4 / 6, casePrecision: 0.5, empty: 1 });
    expect(s.byConstraint.kind).toEqual({ checked: 6, met: 6, unknown: 0, rate: 1 });
    expect(s.byConstraint.directorGender).toEqual({ checked: 2, met: 0, unknown: 1, rate: 0 });
  });
});

describe("datasets/curation.jsonl", () => {
  const cases = readFileSync(fileURLToPath(new URL("./datasets/curation.jsonl", import.meta.url)), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CurationCase);

  it("has unique ids and at least one constraint per case", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) expect(Object.keys(c.constraints).length, c.id).toBeGreaterThan(0);
  });

  // A typo ("Documentaries", "inmigration") would score every pick as failed, silently.
  it("uses only values the catalog's taxonomy has", () => {
    for (const c of cases) {
      const k = c.constraints;
      if (k.genre) expect(GENRES as readonly string[], c.id).toContain(k.genre);
      if (k.theme) expect(THEMES as readonly string[], c.id).toContain(k.theme);
      if (k.country) expect(k.country, c.id).toMatch(/^[A-Z]{2}$/);
      if (k.decade !== undefined) expect(k.decade % 10, c.id).toBe(0);
    }
  });

  // A case the catalog can't fill measures the catalog, not the agent.
  it("only asks for what the catalog holds: at least 3 qualifying titles per case", () => {
    for (const c of cases) expect(c.available, c.id).toBeGreaterThanOrEqual(3);
  });
});
