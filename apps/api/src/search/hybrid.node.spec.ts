import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../bindings.js";
import type { RankedHit, SearchFilters } from "@latino-canon/core";

const { lexicalSearch, semanticSearch } = vi.hoisted(() => ({
  lexicalSearch: vi.fn<(...args: unknown[]) => Promise<RankedHit[]>>(),
  semanticSearch: vi.fn<(...args: unknown[]) => Promise<RankedHit[]>>(),
}));

vi.mock("./lexical.js", () => ({ lexicalSearch }));
vi.mock("./semantic.js", () => ({ semanticSearch }));

const { retrieve } = await import("./hybrid.js");

const env = {} as Env;
const filters: SearchFilters = {};

function hits(...titleIds: string[]): RankedHit[] {
  return titleIds.map((titleId, i) => ({ titleId, score: 1 / (i + 1) }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("retrieve", () => {
  it("mode=lexical calls only lexicalSearch, with the caller's own limit (not the candidate pool size)", async () => {
    lexicalSearch.mockResolvedValueOnce(hits("a", "b"));
    const result = await retrieve(env, { query: "q", mode: "lexical", filters, limit: 10 });

    expect(result).toEqual(hits("a", "b"));
    expect(lexicalSearch).toHaveBeenCalledWith(env, "q", filters, 10);
    expect(semanticSearch).not.toHaveBeenCalled();
  });

  it("mode=semantic calls only semanticSearch, with the caller's own limit", async () => {
    semanticSearch.mockResolvedValueOnce(hits("c"));
    const result = await retrieve(env, { query: "q", mode: "semantic", filters, limit: 5 });

    expect(result).toEqual(hits("c"));
    expect(semanticSearch).toHaveBeenCalledWith(env, "q", filters, 5);
    expect(lexicalSearch).not.toHaveBeenCalled();
  });

  it("mode=hybrid fetches both retrievers at the fixed candidate pool size, not the caller's limit", async () => {
    lexicalSearch.mockResolvedValueOnce(hits("a"));
    semanticSearch.mockResolvedValueOnce(hits("b"));
    await retrieve(env, { query: "q", mode: "hybrid", filters, limit: 5 });

    // CANDIDATE_POOL (40) is fetched from each retriever regardless of the final
    // page size the caller asked for - fusion needs a wide candidate set to rank
    // well even when only a handful of results will actually be returned.
    expect(lexicalSearch).toHaveBeenCalledWith(env, "q", filters, 40);
    expect(semanticSearch).toHaveBeenCalledWith(env, "q", filters, 40);
  });

  it("mode=hybrid returns nothing (not an error) when both retrievers come back empty", async () => {
    lexicalSearch.mockResolvedValueOnce([]);
    semanticSearch.mockResolvedValueOnce([]);
    const result = await retrieve(env, { query: "", mode: "hybrid", filters, limit: 10 });
    expect(result).toEqual([]);
  });

  it("mode=hybrid truncates the fused list to the caller's limit", async () => {
    lexicalSearch.mockResolvedValueOnce(hits("a", "b", "c"));
    semanticSearch.mockResolvedValueOnce(hits("d", "e", "f"));
    const result = await retrieve(env, { query: "q", mode: "hybrid", filters, limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("mode=hybrid favors lexical 2:1 over semantic - a title ranked #1 lexically but absent from semantic beats one ranked #1 semantically but #3 lexically", async () => {
    // With RRF k=60 and weights=[2,1]: lexical-only rank 1 -> 2*(1/61) ≈ 0.0328;
    // semantic-only rank 1 -> 1*(1/61) ≈ 0.0164. The tuned [2,1] weighting (see
    // hybrid.ts's own comment - retuned from [1,1] against the 62-query golden set)
    // means a strong lexical match doesn't get buried by a merely-present semantic
    // one, which is exactly what the retune was for.
    lexicalSearch.mockResolvedValueOnce(hits("lexical-winner"));
    semanticSearch.mockResolvedValueOnce(hits("semantic-winner"));
    const result = await retrieve(env, { query: "q", mode: "hybrid", filters, limit: 10 });

    expect(result[0]?.titleId).toBe("lexical-winner");
  });

  it("mode=hybrid returns keyword results and reports it when the embedding fails", async () => {
    lexicalSearch.mockResolvedValueOnce(hits("a", "b", "c"));
    semanticSearch.mockRejectedValueOnce(new Error("4006: daily neuron allocation exceeded"));
    const onDegraded = vi.fn();
    const result = await retrieve(env, { query: "q", mode: "hybrid", filters, limit: 2, onDegraded });

    expect(result).toEqual(hits("a", "b"));
    expect(onDegraded).toHaveBeenCalledOnce();
  });

  it("mode=semantic falls back to lexicalSearch at the caller's limit when the embedding fails", async () => {
    semanticSearch.mockRejectedValueOnce(new Error("4006"));
    lexicalSearch.mockResolvedValueOnce(hits("a"));
    const onDegraded = vi.fn();
    const result = await retrieve(env, { query: "q", mode: "semantic", filters, limit: 5, onDegraded });

    expect(result).toEqual(hits("a"));
    expect(lexicalSearch).toHaveBeenCalledWith(env, "q", filters, 5);
    expect(onDegraded).toHaveBeenCalledOnce();
  });

  it("a lexical (D1) failure still throws - there's nothing cheaper to fall back to", async () => {
    lexicalSearch.mockRejectedValueOnce(new Error("D1 down"));
    semanticSearch.mockResolvedValueOnce(hits("b"));
    await expect(retrieve(env, { query: "q", mode: "hybrid", filters, limit: 5 })).rejects.toThrow("D1 down");
  });
});
