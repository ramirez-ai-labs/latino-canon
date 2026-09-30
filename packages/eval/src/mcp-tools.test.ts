import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseToolCall, schemaProblems, scoreCase, summarize, toWorkersAiTools, type McpTool, type ToolCase } from "./mcp-tools.js";

// The live server's tools/list, trimmed to what scoring reads (apps/mcp/src/server.ts).
const TOOLS: McpTool[] = [
  {
    name: "search_titles",
    description: "Hybrid keyword + semantic search over the canon.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200 },
        kind: { type: "string", enum: ["film", "series", "special"] },
        decade: { type: "integer", minimum: 1900, maximum: 2030 },
        country: { type: "string", minLength: 2, maxLength: 2 },
        theme: { type: "string", enum: ["immigration", "family"] },
        genre: { type: "string", enum: ["Horror", "Documentary"] },
        inclusionType: { type: "string", enum: ["led_by"] },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      // query is optional since a filter alone can say it all ("films from the 1970s").
      required: [],
    },
  },
  {
    name: "get_title",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 64 } }, required: ["id"] },
  },
  {
    name: "similar_titles",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 12 } },
      required: ["id"],
    },
  },
  { name: "curate", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
];
const NAMES = TOOLS.map((t) => t.name);

describe("toWorkersAiTools", () => {
  it("maps MCP tools to Workers AI's function format, dropping $schema", () => {
    const withSchemaKey = { ...TOOLS[1]!, inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", ...TOOLS[1]!.inputSchema } };
    const [t] = toWorkersAiTools([withSchemaKey]);
    expect(t).toEqual({
      name: "get_title",
      description: "",
      parameters: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 64 } }, required: ["id"] },
    });
  });
});

describe("parseToolCall", () => {
  it("reads tool_calls, with arguments as an object or a JSON string", () => {
    expect(parseToolCall({ tool_calls: [{ name: "get_title", arguments: { id: "coco-2017" } }] }, NAMES)).toEqual({
      name: "get_title",
      arguments: { id: "coco-2017" },
    });
    expect(parseToolCall({ tool_calls: [{ name: "get_title", arguments: '{"id":"coco-2017"}' }] }, NAMES)?.arguments).toEqual({
      id: "coco-2017",
    });
  });

  it("reads a call the model wrote into its text reply", () => {
    // Llama sometimes emits the call as JSON text instead of tool_calls; a client runs it.
    expect(parseToolCall({ response: '{"type": "function", "name": "search_titles", "parameters": {"query": "coco"}}' }, NAMES)).toEqual({
      name: "search_titles",
      arguments: { query: "coco" },
    });
    expect(parseToolCall({ response: '<function=similar_titles>{"id": "coco-2017"}</function>' }, NAMES)?.name).toBe("similar_titles");
  });

  it("treats prose, and made-up tool names, as no call", () => {
    expect(parseToolCall({ response: "The capital of Peru is Lima." }, NAMES)).toBeNull();
    expect(parseToolCall({ response: '{"name": "web_search", "parameters": {}}' }, NAMES)).toBeNull();
    expect(parseToolCall({ response: "Use {braces} like this." }, NAMES)).toBeNull();
  });
});

describe("schemaProblems", () => {
  const search = TOOLS[0]!.inputSchema;
  it("accepts a valid call", () => {
    expect(schemaProblems({ query: "coco", kind: "film", decade: 1990 }, search)).toEqual([]);
  });
  it("reports what the server would reject", () => {
    expect(schemaProblems({ kind: "movie", decade: 1990.5, country: "Mexico", mood: "sad" }, search)).toEqual([
      '"kind" is not one of the allowed values',
      '"decade" should be an integer',
      '"country" is too long',
      'unknown argument "mood"',
    ]);
    const similar = TOOLS[2]!.inputSchema;
    expect(schemaProblems({ limit: 3 }, similar)).toEqual(['missing required "id"']);
  });
  it("accepts a whole number sent as digits, as the server does (apps/mcp intArg) - and nothing looser", () => {
    // The 2026-09-29 run failed 5 of 30 cases on exactly this: the right tool, `"limit": "6"`.
    expect(schemaProblems({ query: "x", decade: "1970", limit: "6" }, search)).toEqual([]);
    expect(schemaProblems({ query: "x", limit: "six" }, search)).toEqual(['"limit" should be an integer']);
    expect(schemaProblems({ query: "x", limit: "20" }, search)).toEqual(['"limit" is above 10']);
    expect(schemaProblems({ query: "x", limit: "6.5" }, search)).toEqual(['"limit" should be an integer']);
  });
});

describe("scoreCase", () => {
  const plain: ToolCase = { id: "p", category: "search", request: "…", tool: "search_titles", queryMentions: ["y tu mama"], noFilters: true };

  it("passes the right tool with the right arguments, comparing the query without accents", () => {
    const r = scoreCase(plain, { name: "search_titles", arguments: { query: "Y tu mamá también" } }, TOOLS);
    expect(r).toMatchObject({ toolCorrect: true, argsCorrect: true, pass: true, problems: [] });
  });

  it("fails a plain lookup that adds a filter - filters exclude, so a guess can hide the answer", () => {
    const r = scoreCase(plain, { name: "search_titles", arguments: { query: "y tu mama tambien", genre: "Documentary" } }, TOOLS);
    expect(r).toMatchObject({ toolCorrect: true, pass: false });
    expect(r.problems).toEqual(["added a filter nobody asked for: genre"]);
  });

  it("checks expected arguments, tolerating a number sent as a string", () => {
    const c: ToolCase = { id: "f", category: "filters", request: "…", tool: "search_titles", args: { country: "MX", decade: 1990 } };
    expect(scoreCase(c, { name: "search_titles", arguments: { query: "films", country: "mx", decade: 1990 } }, TOOLS).pass).toBe(true);
    const wrong = scoreCase(c, { name: "search_titles", arguments: { query: "films", country: "MX" } }, TOOLS);
    expect(wrong.problems).toEqual(['"decade" is missing, expected 1990']);
  });

  it("fails the wrong tool, and no tool, when one was expected", () => {
    const c: ToolCase = { id: "s", category: "similar", request: "…", tool: "similar_titles", args: { id: "coco-2017" } };
    expect(scoreCase(c, { name: "search_titles", arguments: { query: "like coco" } }, TOOLS)).toMatchObject({
      toolCorrect: false,
      problems: ["called search_titles, expected similar_titles"],
    });
    expect(scoreCase(c, null, TOOLS).problems).toEqual(["answered without calling a tool"]);
  });

  // The traps (2026-09-30): the first run scored 30/30, so the set had no case a model could fail.
  it("fails a forbidden value - a story set in the 1940s is not a 1940s film - sent as a number or as digits", () => {
    const c: ToolCase = { id: "t", category: "search", request: "…", tool: "search_titles", forbidArgs: { decade: 1940 }, hard: true };
    expect(scoreCase(c, { name: "search_titles", arguments: { query: "zoot suit riots 1940s" } }, TOOLS).pass).toBe(true);
    expect(scoreCase(c, { name: "search_titles", arguments: { query: "zoot suit", decade: 1940 } }, TOOLS).problems).toEqual([
      `"decade" is 1940, which the request doesn't mean`,
    ]);
    expect(scoreCase(c, { name: "search_titles", arguments: { query: "zoot suit", decade: "1940" } }, TOOLS).pass).toBe(false);
    // Another decade isn't what this case tests; only the forbidden value fails.
    expect(scoreCase(c, { name: "search_titles", arguments: { query: "zoot suit", decade: 1980 } }, TOOLS).pass).toBe(true);
  });

  it("accepts any listed value for an argument", () => {
    const c: ToolCase = { id: "e", category: "get_title", request: "…", tool: "get_title", args: { id: ["selena-1997", "la-bamba-1987"] } };
    expect(scoreCase(c, { name: "get_title", arguments: { id: "la-bamba-1987" } }, TOOLS).pass).toBe(true);
    expect(scoreCase(c, { name: "get_title", arguments: { id: "coco-2017" } }, TOOLS).problems).toEqual([
      `"id" is "coco-2017", expected ["selena-1997","la-bamba-1987"]`,
    ]);
  });

  it("passes no call when no tool fits, and fails a call", () => {
    const c: ToolCase = { id: "n", category: "none", request: "capital of Peru?", tool: null };
    expect(scoreCase(c, null, TOOLS).pass).toBe(true);
    expect(scoreCase(c, { name: "search_titles", arguments: { query: "Peru" } }, TOOLS).problems).toEqual([
      "called search_titles for a request no tool covers",
    ]);
  });
});

describe("summarize", () => {
  it("reports pass rate, tool accuracy, argument accuracy and per-category pass rates", () => {
    const c = (id: string, category: ToolCase["category"], tool: string | null): ToolCase => ({ id, category, request: "…", tool });
    const results = [
      scoreCase(c("a", "search", "get_title"), { name: "get_title", arguments: { id: "x" } }, TOOLS), // pass
      scoreCase(c("b", "search", "get_title"), { name: "get_title", arguments: {} }, TOOLS), // right tool, bad args
      scoreCase(c("c", "curate", "curate"), { name: "search_titles", arguments: { query: "q" } }, TOOLS), // wrong tool
      scoreCase(c("d", "none", null), null, TOOLS), // rightly no tool
    ];
    expect(summarize(results)).toEqual({
      n: 4,
      passRate: 0.5,
      toolAccuracy: 0.75,
      argAccuracy: 0.5,
      byCategory: { search: { n: 2, passRate: 0.5 }, curate: { n: 1, passRate: 0 }, none: { n: 1, passRate: 1 } },
    });
  });
});

describe("summarize, with hard cases", () => {
  it("reports the hard cases' pass rate on its own", () => {
    const c = (id: string, hard: boolean): ToolCase => ({ id, category: "search", request: "…", tool: "get_title", hard });
    const results = [
      scoreCase(c("a", true), { name: "get_title", arguments: { id: "x" } }, TOOLS),
      scoreCase(c("b", true), null, TOOLS),
      scoreCase(c("c", false), { name: "get_title", arguments: { id: "x" } }, TOOLS),
    ];
    expect(summarize(results)).toMatchObject({ passRate: 2 / 3, hard: { n: 2, passRate: 0.5 } });
  });
});

describe("datasets/mcp-tools.jsonl", () => {
  const cases = readFileSync(fileURLToPath(new URL("./datasets/mcp-tools.jsonl", import.meta.url)), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ToolCase);

  it("has unique ids and only real tools", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) expect(c.tool === null || NAMES.includes(c.tool)).toBe(true);
  });

  it("expects only arguments the tool's schema accepts", () => {
    for (const c of cases.filter((c) => c.tool && c.args)) {
      const schema = TOOLS.find((t) => t.name === c.tool)!.inputSchema;
      // A list means any one value is right, so every one of them must be valid.
      const width = Math.max(1, ...Object.values(c.args!).map((v) => (Array.isArray(v) ? v.length : 1)));
      for (let i = 0; i < width; i++) {
        const one = Object.fromEntries(Object.entries(c.args!).map(([k, v]) => [k, Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v]));
        const args = { ...one, ...(schema.required?.includes("query") ? { query: "x" } : {}) };
        expect(schemaProblems(args, schema), c.id).toEqual([]);
      }
    }
  });

  it("forbids only arguments the tool has", () => {
    for (const c of cases.filter((c) => c.forbidArgs)) {
      const props = TOOLS.find((t) => t.name === c.tool)!.inputSchema.properties ?? {};
      for (const key of Object.keys(c.forbidArgs!)) expect(Object.keys(props), c.id).toContain(key);
    }
  });

  it("says why each hard case's answer is the right one", () => {
    for (const c of cases.filter((c) => c.hard)) expect(c.note, c.id).toBeTruthy();
  });

  it("names, in each follow-up request, a title id the conversation actually showed", () => {
    for (const c of cases.filter((c) => c.args?.id !== undefined)) {
      const shown = (c.context ?? []).map((m) => m.content).join("\n");
      for (const id of [c.args!.id].flat()) expect(shown, c.id).toContain(`id ${id}`);
    }
  });
});
