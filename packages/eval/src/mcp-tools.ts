/**
 * MCP tool-selection eval: does a model, given only what the live MCP server tells every
 * client (its instructions and its tools/list), call the right tool with the right
 * arguments? The server makes no LLM calls itself - the client brings the model - so the
 * tool names, descriptions and schemas are the whole product surface an assistant sees.
 * This scores that surface, and gates changes to it.
 *
 * Pure scoring lives here (tested in mcp-tools.test.ts); run-mcp-tools.ts does the I/O.
 */
import { extractJson } from "@latino-canon/core";

/** One entry of the MCP server's tools/list, as the server sends it. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: JsonSchemaObject;
}

export interface JsonSchemaProperty {
  type?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
}

export interface JsonSchemaObject {
  type?: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ToolCaseCategory = "search" | "filters" | "get_title" | "similar" | "curate" | "none";

/** A golden case (datasets/mcp-tools.jsonl). */
export interface ToolCase {
  id: string;
  category: ToolCaseCategory;
  /** Earlier turns, e.g. a search whose results the request refers back to ("the second one"). */
  context?: ChatMessage[];
  request: string;
  /** The tool the model should call, or null when no tool fits (the model should answer itself). */
  tool: string | null;
  /** Arguments that must equal these values (other arguments are allowed). */
  args?: Record<string, string | number>;
  /** Phrases the `query` argument must contain, compared without accents or case - the
   * tools ask for "the person's own words". */
  queryMentions?: string[];
  /** search_titles filters narrow strictly, so a plain lookup must not add any. */
  noFilters?: boolean;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface CaseResult {
  id: string;
  category: ToolCaseCategory;
  expected: string | null;
  called: ToolCall | null;
  toolCorrect: boolean;
  /** Only meaningful when toolCorrect and a tool was expected. */
  argsCorrect: boolean;
  pass: boolean;
  problems: string[];
}

/** search_titles' optional filters; each excludes titles that don't match. */
export const SEARCH_FILTERS = ["kind", "decade", "country", "theme", "genre", "inclusionType"] as const;

/**
 * Workers AI's function-calling format: `{ name, description, parameters }` per tool. The
 * `$schema` key the MCP SDK adds is dropped; the rest of the JSON Schema passes through.
 */
export function toWorkersAiTools(tools: McpTool[]) {
  return tools.map((t) => {
    const { properties = {}, required = [] } = t.inputSchema;
    return {
      name: t.name,
      description: t.description ?? "",
      parameters: { type: "object", properties, required },
    };
  });
}

function asArgs(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asArgs(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * The first tool call in a Workers AI reply, or null when the model answered in text.
 * Normally `tool_calls: [{ name, arguments }]`. Llama models sometimes write the call into
 * `response` instead - as JSON (`{"name":…,"parameters":…}`) or as `<function=name>{…}</function>` -
 * which a client would also treat as a call, so those count too, if the name is a real tool.
 */
export function parseToolCall(
  result: { response?: unknown; tool_calls?: { name?: string; arguments?: unknown }[] },
  toolNames: string[],
): ToolCall | null {
  const first = result.tool_calls?.find((c) => typeof c.name === "string");
  if (first?.name) return { name: first.name, arguments: asArgs(first.arguments) };

  const text = typeof result.response === "string" ? result.response.trim() : "";
  if (!text) return null;
  const tagged = /<function=([\w-]+)>\s*(\{[\s\S]*?\})\s*<\/function>/.exec(text);
  if (tagged && toolNames.includes(tagged[1]!)) return { name: tagged[1]!, arguments: asArgs(tagged[2]) };
  if (!text.includes("{")) return null;
  try {
    const obj = asArgs(extractJson(text));
    const name = typeof obj.name === "string" ? obj.name : null;
    if (name && toolNames.includes(name)) return { name, arguments: asArgs(obj.parameters ?? obj.arguments) };
  } catch {
    // Prose with a brace in it, not a call.
  }
  return null;
}

/**
 * Checks arguments against the tool's input schema, as the MCP SDK does server-side
 * before running a tool: a call that fails here would come back to the client as an error.
 *
 * It mirrors what the server accepts, not just what it advertises: integer arguments take
 * a digit string too ("6" for 6, apps/mcp `intArg`), because open models often send numbers
 * as text. Scoring that as a failure would count calls the server runs fine.
 */
export function schemaProblems(args: Record<string, unknown>, schema: JsonSchemaObject): string[] {
  const props = schema.properties ?? {};
  const problems: string[] = [];
  for (const r of schema.required ?? []) if (args[r] === undefined) problems.push(`missing required "${r}"`);
  for (const [key, raw] of Object.entries(args)) {
    const p = props[key];
    const value = p?.type === "integer" && typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
    if (!p) {
      problems.push(`unknown argument "${key}"`);
      continue;
    }
    if (p.type === "string" && typeof value !== "string") problems.push(`"${key}" should be a string`);
    if (p.type === "integer" && !Number.isInteger(value)) problems.push(`"${key}" should be an integer`);
    if (p.enum && !p.enum.includes(value as string | number)) problems.push(`"${key}" is not one of the allowed values`);
    if (typeof value === "number") {
      if (p.minimum !== undefined && value < p.minimum) problems.push(`"${key}" is below ${p.minimum}`);
      if (p.maximum !== undefined && value > p.maximum) problems.push(`"${key}" is above ${p.maximum}`);
    }
    if (typeof value === "string") {
      if (p.minLength !== undefined && value.length < p.minLength) problems.push(`"${key}" is too short`);
      if (p.maxLength !== undefined && value.length > p.maxLength) problems.push(`"${key}" is too long`);
    }
  }
  return problems;
}

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * A model will often pass a whole number as "1990" or 1990.0; compare loosely so the
 * eval measures the choice, not the JSON typing (schemaProblems reports the typing).
 */
function sameValue(actual: unknown, expected: string | number): boolean {
  if (typeof expected === "number") return Number(actual) === expected;
  return typeof actual === "string" && actual.trim().toLowerCase() === expected.toLowerCase();
}

export function scoreCase(c: ToolCase, called: ToolCall | null, tools: McpTool[]): CaseResult {
  const problems: string[] = [];
  const base = { id: c.id, category: c.category, expected: c.tool, called };

  if (c.tool === null) {
    const pass = called === null;
    if (!pass) problems.push(`called ${called.name} for a request no tool covers`);
    return { ...base, toolCorrect: pass, argsCorrect: pass, pass, problems };
  }
  if (!called) {
    problems.push("answered without calling a tool");
    return { ...base, toolCorrect: false, argsCorrect: false, pass: false, problems };
  }
  if (called.name !== c.tool) {
    problems.push(`called ${called.name}, expected ${c.tool}`);
    return { ...base, toolCorrect: false, argsCorrect: false, pass: false, problems };
  }

  const tool = tools.find((t) => t.name === c.tool);
  if (tool) problems.push(...schemaProblems(called.arguments, tool.inputSchema));
  for (const [key, want] of Object.entries(c.args ?? {})) {
    const got = called.arguments[key];
    if (!sameValue(got, want)) problems.push(`"${key}" is ${got === undefined ? "missing" : JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
  const query = typeof called.arguments.query === "string" ? fold(called.arguments.query) : "";
  for (const phrase of c.queryMentions ?? []) {
    if (!query.includes(fold(phrase))) problems.push(`query doesn't contain "${phrase}"`);
  }
  if (c.noFilters) {
    const added = SEARCH_FILTERS.filter((f) => called.arguments[f] !== undefined);
    if (added.length) problems.push(`added a filter nobody asked for: ${added.join(", ")}`);
  }
  const argsCorrect = problems.length === 0;
  return { ...base, toolCorrect: true, argsCorrect, pass: argsCorrect, problems };
}

export interface ToolEvalSummary {
  n: number;
  /** Cases passed outright: right tool (or none), valid and correct arguments. The headline. */
  passRate: number;
  /** Right tool, or rightly no tool. */
  toolAccuracy: number;
  /** Of the cases where the right tool was called, the share with correct arguments. */
  argAccuracy: number;
  byCategory: Record<string, { n: number; passRate: number }>;
}

const share = (hits: number, n: number) => (n > 0 ? hits / n : 0);

export function summarize(results: CaseResult[]): ToolEvalSummary {
  const toolHits = results.filter((r) => r.toolCorrect);
  const withArgs = toolHits.filter((r) => r.expected !== null);
  const byCategory: ToolEvalSummary["byCategory"] = {};
  for (const r of results) {
    const c = (byCategory[r.category] ??= { n: 0, passRate: 0 });
    c.n++;
    c.passRate += r.pass ? 1 : 0;
  }
  for (const c of Object.values(byCategory)) c.passRate = share(c.passRate, c.n);
  return {
    n: results.length,
    passRate: share(results.filter((r) => r.pass).length, results.length),
    toolAccuracy: share(toolHits.length, results.length),
    argAccuracy: share(withArgs.filter((r) => r.argsCorrect).length, withArgs.length),
    byCategory,
  };
}
