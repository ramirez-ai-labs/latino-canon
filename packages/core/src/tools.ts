import { z } from "zod";
import { GENRES, INCLUSION_TYPES, THEMES } from "./taxonomy.js";

/**
 * The canon's read-only tools, defined once: names, titles, descriptions and input schemas.
 * The public MCP server (apps/mcp) advertises them to any client's model, and the curation
 * agent (docs/design/AGENTIC_CURATION_V2.md) gives the same ones to its own model, so the MCP
 * tool-selection eval (packages/eval, mcp-tools) measures exactly the surface the agent sees.
 * Two copies of a contract drift - the embedding contract did, and every filtered semantic
 * query broke (CLAUDE.md #6, incident 4). Output shapes stay with each consumer: the MCP
 * server returns full cards, the agent compact lines.
 *
 * Wording here is product surface: a change is measured with the tool-selection eval before
 * it ships (CLAUDE.md #7).
 */

/**
 * A whole number that also accepts its digits as a string. Open models often send numbers
 * as text ("6" for 6): on the 2026-09-29 tool-selection eval, 5 of 8 failures were exactly
 * that - the right tool and the right title, rejected over `"limit": "6"`. Only a digit
 * string is converted, so "abc" and out-of-range values still fail, and the advertised
 * schema stays `integer`.
 */
export const intArg = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v), z.number().int().min(min).max(max));

/** search_titles' optional filters; each excludes titles that don't match. */
export const SEARCH_TOOL_FILTERS = ["kind", "decade", "country", "theme", "genre", "inclusionType"] as const;

const titleId = () => z.string().min(1).max(64).describe('Title id, e.g. "coco-2017"');

export const CANON_TOOLS = {
  search_titles: {
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
  },
  get_title: {
    title: "Get a title",
    description:
      "The full record for one title by id (from search_titles or similar_titles): synopsis, credits, " +
      "why it's in the canon and on what authority (seed/editor-curated or the classifier's, with its " +
      "confidence), and its sourced 'why it matters' note when an editor or the groundedness judge has " +
      "approved one.",
    inputSchema: { id: titleId() },
  },
  similar_titles: {
    title: "Titles like this one",
    description:
      "Titles nearest this one in meaning (story, setting, themes), most similar first - for 'more like " +
      "this'. Can return fewer than asked for, or none for a title still being added.",
    inputSchema: {
      id: titleId(),
      limit: intArg(1, 12).default(6),
    },
  },
  curate: {
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
  },
} as const;

export type CanonToolName = keyof typeof CANON_TOOLS;
