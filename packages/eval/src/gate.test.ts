import { describe, expect, it } from "vitest";
import { byCategory, checkGate, goldenSetHash, type GoldQuery } from "./gate.js";

describe("checkGate", () => {
  it("passes with no comparable baseline - the run becomes the baseline", () => {
    expect(checkGate(0.8, null, 0.03)).toEqual({ pass: true, baseline: null, current: 0.8, delta: null });
  });

  it("passes within the allowed drop and fails beyond it", () => {
    expect(checkGate(0.78, 0.8, 0.03).pass).toBe(true);
    expect(checkGate(0.76, 0.8, 0.03).pass).toBe(false);
  });
});

describe("goldenSetHash", () => {
  const q = (id: string, relevant: string[]): GoldQuery => ({ id, query: `query ${id}`, category: "plot", relevant });

  it("ignores order of relevant ids and notes, changes when a query or answer changes", () => {
    const base = goldenSetHash([q("q1", ["a", "b"])]);
    expect(goldenSetHash([{ ...q("q1", ["b", "a"]), note: "edited note" }])).toBe(base);
    expect(goldenSetHash([q("q1", ["a"])])).not.toBe(base);
    expect(goldenSetHash([q("q1", ["a", "b"]), q("q2", ["c"])])).not.toBe(base);
  });
});

describe("byCategory", () => {
  it("scores each category separately", () => {
    const cats = byCategory([
      { id: "1", category: "known-item", ranked: ["a"], relevant: ["a"] },
      { id: "2", category: "spanish", ranked: ["x"], relevant: ["b"] },
    ]);
    expect(cats["known-item"]?.["recall@5"]).toBe(1);
    expect(cats.spanish?.["recall@5"]).toBe(0);
  });
});
