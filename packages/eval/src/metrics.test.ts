import { describe, expect, it } from "vitest";
import { ndcgAtK, precisionAtK, recallAtK, reciprocalRank } from "./metrics.js";

const rel = new Set(["a", "b"]);

describe("metrics", () => {
  it("recall@k", () => {
    expect(recallAtK(["a", "x", "b"], rel, 5)).toBe(1);
    expect(recallAtK(["a", "x", "y"], rel, 5)).toBe(0.5);
    expect(recallAtK(["a", "b"], rel, 1)).toBe(0.5);
  });

  it("precision@k", () => {
    expect(precisionAtK(["a", "b", "x", "y"], rel, 2)).toBe(1);
    expect(precisionAtK(["x", "a", "y", "b"], rel, 4)).toBe(0.5);
  });

  it("reciprocalRank", () => {
    expect(reciprocalRank(["x", "a"], rel)).toBe(0.5);
    expect(reciprocalRank(["a"], rel)).toBe(1);
    expect(reciprocalRank(["x", "y"], rel)).toBe(0);
  });

  it("ndcg@k is 1 when all relevant items are on top", () => {
    expect(ndcgAtK(["a", "b", "x"], rel, 10)).toBeCloseTo(1);
    expect(ndcgAtK(["x", "a", "b"], rel, 10)).toBeLessThan(1);
  });
});
