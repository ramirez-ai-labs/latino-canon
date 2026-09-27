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
import { ApiError, type ApiClient } from "./api.js";
import { cardSummary, rankedSummary, titleDetail } from "./format.js";

export const SERVER_NAME = "latino-canon";
export const SERVER_VERSION = "1.0.0";

const INSTRUCTIONS = `Latino Canon is an editorially curated catalog of Latino-led and Latino-focused films and
series (US Latino and Latin American cinema, plus Spain and Brazil), each with a sourced note on why it's in
the canon. "Latino-focused" is an explicit taxonomy, not a genre: a title qualifies as Latino-directed,
Latino-created (writer or creator), about the community, a breakthrough first, Latino-led cast, or
Latino-produced.

Use search_titles for anything a person might type (plots half-remembered, Spanish queries, people, titles),
get_title for the full record and its sourced "why it matters" note, similar_titles for "more like this",
and curate when the ask is a recommendation with a mood or audience ("something uplifting by a Latina
director"). Every result has a url to its page on the site - cite it. Only state facts the results give you:
the canon's notes are grounded in their sources, and answers built on them should be too.`;

// Every tool reads the public catalog and changes nothing.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const json = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
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
        "narrow strictly; leave them out unless the person asked for one.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("What to look for, in the person's own words"),
        kind: z.enum(["film", "series", "special"]).optional().describe("special = a stand-up comedy special"),
        decade: z.number().int().min(1900).max(2030).optional().describe("Start year of a decade, e.g. 1990"),
        country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 production country, e.g. MX"),
        theme: z.enum(THEMES).optional(),
        genre: z.enum(GENRES).optional(),
        inclusionType: z.enum(INCLUSION_TYPES).optional().describe("Why a title is in the canon"),
        limit: z.number().int().min(1).max(10).default(5),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      run(
        "search_titles",
        async () => {
          const qs = new URLSearchParams({ q: args.query, mode: "hybrid", limit: String(args.limit) });
          for (const k of ["kind", "decade", "country", "theme", "genre", "inclusionType"] as const) {
            const v = args[k];
            if (v !== undefined) qs.set(k, String(v));
          }
          const res = await api.get<SearchResponse>(`/search?${qs.toString()}`);
          return json({
            query: args.query,
            ...(res.interpretation ? { interpretedAs: res.interpretation.rationale } : {}),
            ...(res.degraded ? { note: "Keyword-only results: semantic search is unavailable right now." } : {}),
            results: res.results.map((c) => cardSummary(c, webUrl)),
          });
        },
        "No results.",
      ),
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
        limit: z.number().int().min(1).max(12).default(6),
      },
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
        limit: z.number().int().min(1).max(10).default(5),
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
