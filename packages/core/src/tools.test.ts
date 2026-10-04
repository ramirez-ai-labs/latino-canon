import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CANON_TOOLS, intArg, parseToolCalls, SEARCH_TOOL_FILTERS, toWorkersAiTool } from "./tools.js";

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

describe("toWorkersAiTool", () => {
  it("gives Workers AI the shared description and a plain JSON Schema, integers advertised as integers", () => {
    const t = toWorkersAiTool("similar_titles");
    expect(t.description).toBe(CANON_TOOLS.similar_titles.description);
    expect(t.parameters).not.toHaveProperty("$schema");
    expect(t.parameters).toMatchObject({ type: "object", required: ["id"], properties: { limit: { type: "integer", minimum: 1, maximum: 12 } } });
  });
});

describe("parseToolCalls", () => {
  it("returns every call in a reply, in order, for the agent loop", () => {
    const calls = parseToolCalls(
      { tool_calls: [{ name: "search_titles", arguments: { country: "CO" } }, { name: "get_title", arguments: '{"id":"monos-2019"}' }] },
      ["search_titles", "get_title"],
    );
    expect(calls).toEqual([
      { name: "search_titles", arguments: { country: "CO" } },
      { name: "get_title", arguments: { id: "monos-2019" } },
    ]);
  });

  it("returns none for prose", () => {
    expect(parseToolCalls({ response: "Here are some films." }, ["search_titles"])).toEqual([]);
  });
});
