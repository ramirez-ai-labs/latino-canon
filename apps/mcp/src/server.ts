import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  GENRES,
  INCLUSION_TYPES,
  THEMES,
  type CurationResponse,
  type SearchResponse,
  type Title,
  type TitleCard,
} from "@latino-canon/core";
import { z } from "zod";
import rootPackage from "../../../package.json";
import { ApiError, type ApiClient } from "./api.js";
import { cardSchema, cardSummary, detailSchema, rankedSchema, rankedSummary, titleDetail } from "./format.js";

export const SERVER_NAME = "latino-canon";
// The repo's release version, so a client's serverInfo says which release it's talking to.
// Bundled at build time; bumping the root package.json (the release process) updates it.
export const SERVER_VERSION: string = rootPackage.version;

const INSTRUCTIONS = `Latino Canon is an editorially curated catalog of Latino-led and Latino-focused films and
series (US Latino and Latin American cinema, plus Spain and Brazil), each with a sourced note on why it's in
the canon. "Latino-focused" is an explicit taxonomy, not a genre: a title qualifies as Latino-directed,
Latino-created (writer or creator), about the community, a breakthrough first, Latino-led cast, or
Latino-produced.

Use search_titles for anything a person might type (plots half-remembered, Spanish queries, people, titles),
get_title for the full record and its sourced "why it matters" note, similar_titles for "more like this",
and curate when the ask is a recommendation with a mood or audience ("something uplifting by a Latina
director"). Every result has a url to its page on the site - cite it. Only state facts the results give you:
the canon's notes are grounded in their sources, and answers built on them should be too.

These tools only cover the canon's films and series. For anything else - general knowledge, math,
translation, small talk - answer directly and don't call a tool.`;

/**
 * A whole number that also accepts its digits as a string. Open models often send numbers
 * as text ("6" for 6): on the 2026-09-29 tool-selection eval, 5 of 8 failures were exactly
 * that - the right tool and the right title, rejected over `"limit": "6"`. Only a digit
 * string is converted, so "abc" and out-of-range values still fail, and the advertised
 * schema stays `integer`.
 */
const intArg = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v), z.number().int().min(min).max(max));

const SEARCH_FILTERS = ["kind", "decade", "country", "theme", "genre", "inclusionType"] as const;

// Every tool reads the public catalog and changes nothing.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/**
 * Structured output (MCP 2025-06-18+): typed `structuredContent` that the SDK validates
 * against the tool's outputSchema, plus the same JSON as text for clients that predate it,
 * as the spec recommends. The JSON round-trip drops `undefined` optionals, which a JSON
 * Schema validator would otherwise see as present-but-invalid.
 */
function json(value: Record<string, unknown>): CallToolResult {
  const text = JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) as Record<string, unknown> };
}
const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });

/** One api call per tool, with the api's own failures turned into something a model can act on. */
async function run(tool: string, fn: () => Promise<CallToolResult>, notFound: string): Promise<CallToolResult> {
  const started = Date.now();
  let result: CallToolResult;
  try {
    result = await fn();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) result = failure(notFound);
    else if (err instanceof ApiError && err.status === 429)
      // Search's per-minute limit, or the curation agent's per-minute or daily cap.
      result = failure(
        "Rate limited by the Latino Canon api. Wait a minute and retry; if curate stays limited, it has hit its daily cap - use search_titles.",
      );
    else result = failure(`The Latino Canon api failed (${err instanceof Error ? err.message : String(err)}).`);
  }
  console.warn(
    JSON.stringify({ event: "mcp.tool", tool, outcome: result.isError ? "error" : "ok", ms: Date.now() - started }),
  );
  return result;
}

export function buildServer(api: ApiClient, webUrl: string): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION, title: "Latino Canon" },
    // Ajv, the default validator, compiles schemas with `new Function`, which Workers forbid.
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );

  server.registerTool(
    "search_titles",
    {
      title: "Search the Latino Canon",
      description:
        "Hybrid keyword + semantic search over the canon. Accepts anything a person might type: a title " +
        "(exact titles rank first), a half-remembered plot, a person, a theme, English or Spanish. Filters " +
        "narrow strictly; leave them out unless the person asked for one. When a filter says it all " +
        "('films from the 1970s', 'series from Colombia'), the query can be left out.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe("What to look for, in the person's own words. Optional only when a filter is given."),
        kind: z.enum(["film", "series", "special"]).optional().describe("special = a stand-up comedy special"),
        decade: intArg(1900, 2030).optional().describe("Start year of a decade, e.g. 1990"),
        country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 production country, e.g. MX"),
        theme: z.enum(THEMES).optional(),
        genre: z.enum(GENRES).optional(),
        inclusionType: z.enum(INCLUSION_TYPES).optional().describe("Why a title is in the canon"),
        limit: intArg(1, 10).default(5),
      },
      outputSchema: {
        query: z.string(),
        interpretedAs: z.string().optional().describe("How the query was interpreted, when it was rewritten"),
        note: z.string().optional(),
        results: z.array(cardSchema),
      },
      annotations: READ_ONLY,
    },
    (args) => {
      // A filter-only request ("films from the 1970s") browses by filter, as the site does; a
      // request with neither is a mistake worth telling the model about, not a full dump.
      if (!args.query && !SEARCH_FILTERS.some((k) => args[k] !== undefined)) {
        return Promise.resolve(failure("Give a query, or at least one filter (kind, decade, country, theme, genre, inclusionType)."));
      }
      return run(
        "search_titles",
        async () => {
          const qs = new URLSearchParams({ mode: "hybrid", limit: String(args.limit) });
          if (args.query) qs.set("q", args.query);
          for (const k of SEARCH_FILTERS) {
            const v = args[k];
            if (v !== undefined) qs.set(k, String(v));
          }
          const res = await api.get<SearchResponse>(`/search?${qs.toString()}`);
          return json({
            query: args.query ?? "",
            ...(res.interpretation ? { interpretedAs: res.interpretation.rationale } : {}),
            ...(res.degraded ? { note: "Keyword-only results: semantic search is unavailable right now." } : {}),
            results: res.results.map((c) => cardSummary(c, webUrl)),
          });
        },
        "No results.",
      );
    },
  );

  server.registerTool(
    "get_title",
    {
      title: "Get a title",
      description:
        "The full record for one title by id (from search_titles or similar_titles): synopsis, credits, " +
        "why it's in the canon and on what authority (seed/editor-curated or the classifier's, with its " +
        "confidence), and its sourced 'why it matters' note when an editor or the groundedness judge has " +
        "approved one.",
      inputSchema: { id: z.string().min(1).max(64).describe('Title id, e.g. "coco-2017"') },
      outputSchema: detailSchema.shape,
      annotations: READ_ONLY,
    },
    ({ id }) =>
      run(
        "get_title",
        async () => json(titleDetail(await api.get<Title>(`/titles/${encodeURIComponent(id)}`), webUrl)),
        `No title "${id}" in the canon. Ids come from search_titles results.`,
      ),
  );

  server.registerTool(
    "similar_titles",
    {
      title: "Titles like this one",
      description:
        "Titles nearest this one in meaning (story, setting, themes), most similar first - for 'more like " +
        "this'. Can return fewer than asked for, or none for a title still being added.",
      inputSchema: {
        id: z.string().min(1).max(64).describe('Title id, e.g. "coco-2017"'),
        limit: intArg(1, 12).default(6),
      },
      outputSchema: { like: z.string(), results: z.array(cardSchema) },
      annotations: READ_ONLY,
    },
    ({ id, limit }) =>
      run(
        "similar_titles",
        async () => {
          const res = await api.get<{ titleId: string; results: TitleCard[] }>(
            `/titles/${encodeURIComponent(id)}/similar?limit=${limit}`,
          );
          return json({ like: id, results: res.results.map((c) => cardSummary(c, webUrl)) });
        },
        `No title "${id}" in the canon. Ids come from search_titles results.`,
      ),
  );

  server.registerTool(
    "curate",
    {
      title: "Curate recommendations",
      description:
        "The canon's curation agent, for a recommendation ask with a mood, audience or who-made-it " +
        "constraint ('something uplifting by a Latina director', 'a family movie about immigration'). " +
        "Returns picks with the reason each matched and the agent's reasoning steps. Slower and more " +
        "limited than search_titles; use search_titles for plain lookups.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("The recommendation request, in the person's words"),
        limit: intArg(1, 10).default(5),
      },
      outputSchema: {
        query: z.string(),
        interpretation: z.string(),
        reasoning: z.array(z.string()).describe("The agent's steps, in order"),
        picks: z.array(rankedSchema),
      },
      annotations: READ_ONLY,
    },
    ({ query, limit }) =>
      run(
        "curate",
        async () => {
          const res = await api.post<CurationResponse>("/agents/curate", { query, limit });
          return json({
            query,
            interpretation: res.interpretation,
            reasoning: res.reasoning,
            picks: res.topResults.map((r) => rankedSummary(r, webUrl)),
          });
        },
        "No picks.",
      ),
  );

  return server;
}
