import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CANON_TOOLS, intArg, SEARCH_TOOL_FILTERS } from "./tools.js";

describe("CANON_TOOLS", () => {
  it("defines the four read-only tools the MCP server and the curation agent share", () => {
    expect(Object.keys(CANON_TOOLS)).toEqual(["search_titles", "get_title", "similar_titles", "curate"]);
    for (const t of Object.values(CANON_TOOLS)) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("gives search_titles every filter the handlers read", () => {
    for (const f of SEARCH_TOOL_FILTERS) expect(Object.keys(CANON_TOOLS.search_titles.inputSchema)).toContain(f);
  });

  it("validates arguments as the server does: limits default, ids are bounded", () => {
    const search = z.object(CANON_TOOLS.search_titles.inputSchema);
    expect(search.parse({ query: "coco" }).limit).toBe(5);
    expect(search.safeParse({ query: "coco", country: "Mexico" }).success).toBe(false);
    const get = z.object(CANON_TOOLS.get_title.inputSchema);
    expect(get.safeParse({ id: "" }).success).toBe(false);
    expect(get.safeParse({ id: "x".repeat(65) }).success).toBe(false);
  });
});

describe("intArg", () => {
  // The 2026-09-29 tool-selection eval: 5 of 8 failures were the right call with "limit": "6".
  it("accepts a whole number sent as digits, and nothing looser", () => {
    const limit = intArg(1, 10);
    expect(limit.parse("6")).toBe(6);
    expect(limit.parse(6)).toBe(6);
    expect(limit.safeParse("six").success).toBe(false);
    expect(limit.safeParse("6.5").success).toBe(false);
    expect(limit.safeParse("20").success).toBe(false);
  });
});
