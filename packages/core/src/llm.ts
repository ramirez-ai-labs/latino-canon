/**
 * Thin LLM call abstraction over Workers AI, routed through AI Gateway for caching +
 * observability. Workers AI only, by design - no closed-model provider in this project.
 */
import { INCLUSION_TYPES, THEMES } from "./taxonomy.js";

export type LlmProvider = "workers-ai";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallOptions {
  /** Logical task name — surfaces in AI Gateway metadata and picks the model tier. */
  task: "query-rewrite" | "classify" | "blurb" | "judge" | "content-advisory";
  /** Which caller/route made this call - e.g. "search", "agents.curate", "ingest".
   * `task` alone can't distinguish /search's rewriteQuery call from the curation
   * agent's, since both use "query-rewrite" - this is what makes AI Gateway logs
   * filterable by which feature actually produced a given call. Optional so
   * existing call sites aren't forced to update immediately. */
  caller?: string;
  messages: LlmMessage[];
  /** Ask the model for strict JSON. Callers still validate with zod. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Tool calling (the curation agent v2, docs/design/AGENTIC_CURATION_V2.md). A tool's result
 * goes back as a `tool` message named for the tool, never merged into the system prompt:
 * results carry third-party text (TMDB synopses) that may contain instructions.
 */
export type ToolLoopMessage = LlmMessage | { role: "tool"; name: string; content: string };

export interface ToolCallOptions {
  caller: string;
  model: string;
  messages: ToolLoopMessage[];
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
  maxTokens: number;
}

export interface ToolCallResult {
  /** The model's reply as Workers AI returns it; parse it with parseToolCalls (tools.ts). */
  reply: { response?: unknown; tool_calls?: { name?: string; arguments?: unknown }[] };
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface ToolCallingClient {
  callTools(opts: ToolCallOptions): Promise<ToolCallResult>;
}

export interface LlmResult {
  text: string;
  model: string;
  provider: LlmProvider;
  cached: boolean;
}

export interface LlmClient {
  provider: LlmProvider;
  call(opts: LlmCallOptions): Promise<LlmResult>;
}

/**
 * Model choice per task. Keep runtime tasks small/cheap.
 *
 * query-rewrite/judge were on the plain (non "-fast") llama-3.1-8b-instruct, which
 * Cloudflare deprecated 2026-05-30 - every call has been returning 410 Gone since,
 * silently falling back to each caller's own rules-based path (rewriteQuery.ts's
 * rules pass; scoreTone's catch-and-skip). This was invisible for ~4 months because
 * that fallback design means /search never actually broke for a user - it just quietly
 * ran without LLM-based query interpretation the whole time. Only surfaced via the
 * curation agent's new structured logging (docs/operations/monitoring.md). The
 * "-fast" variant is confirmed still active - verified against Cloudflare's own
 * deprecation changelog before changing this, not just taken on faith.
 */
export const MODELS: Record<LlmCallOptions["task"], string> = {
  "query-rewrite": "@cf/meta/llama-3.1-8b-instruct-fast",
  classify: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  blurb: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  judge: "@cf/meta/llama-3.1-8b-instruct-fast",
  // A single general/mature judgment from a synopsis doesn't need the 70B classify
  // model's multi-label nuance - same tier as judge/query-rewrite.
  "content-advisory": "@cf/meta/llama-3.1-8b-instruct-fast",
};

export const EMBEDDING_MODEL = "@cf/baai/bge-m3"; // 1024-dim, multilingual (EN + ES)
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Workers AI's `response` field is typed as a string, but has been observed returning an
 * already-parsed value for some completions (seen live: classify calls got a string back,
 * a blurb call on the same model didn't). Normalize either shape before it reaches
 * `extractJson`, which requires a string and throws an opaque `text.match is not a
 * function` otherwise.
 */
export function coerceLlmText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

/** Best-effort extraction of a JSON object from an LLM response. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`no JSON object in LLM output: ${text.slice(0, 200)}`);
  const json = candidate.slice(start, end + 1);
  try {
    return JSON.parse(json) as unknown;
  } catch (err) {
    const repaired = escapeInnerQuotes(json);
    if (repaired === json) throw err;
    try {
      return JSON.parse(repaired) as unknown;
    } catch {
      throw err; // report the model's own output, not the repair attempt
    }
  }
}

/**
 * Found live (2026-09-28, Crónicas (2004)): the synopsis quotes a nickname - a killer
 * known as the "Monster of Babahoyo." - and the blurb model copied the quotes into its
 * "text" value unescaped, so JSON.parse failed ("Expected ',' or '}' after property
 * value"). At temperature 0 both step retries returned the same reply, and the title went
 * live with no blurb. Any synopsis with a quoted phrase can do this.
 *
 * The repair: inside a string, a `"` only closes the string when what follows is JSON
 * structure - `:`, `}`, `]`, end of input, or a `,` that is itself followed by the start of
 * a value or key. Any other `"` is a quote in the prose and gets escaped. Used only after a
 * plain parse fails, so well-formed replies never pass through it.
 */
export function escapeInnerQuotes(json: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]!;
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === "\\") {
      out += ch + (json[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') {
      if (closesString(json, i + 1)) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

function closesString(json: string, from: number): boolean {
  const rest = json.slice(from).trimStart();
  if (rest === "" || /^[:}\]]/.test(rest)) return true;
  // After a comma, the next thing must be a key or a value, not more prose.
  return /^,\s*(["{[\]}\d-]|true\b|false\b|null\b)/.test(rest);
}

/**
 * Workers AI classify calls have been observed returning `inclusionTypes`/`themes`
 * slugs that don't match the taxonomy exactly - wrong case ("Family" instead of
 * "family"), or a synonym that isn't in the taxonomy at all ("education" for the
 * closest real theme, "identity"). Lowercase/trim before validating, and drop entries
 * that still don't match a known slug rather than fail the whole classify step over
 * one bad tag - a partial classification beats none. Also seen live: `note` sent as
 * `null` instead of omitted, which `z.string().optional()` rejects.
 */
export function normalizeClassificationJson(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    inclusionTypes: normalizeTagList(obj.inclusionTypes, "type", INCLUSION_TYPES),
    themes: normalizeTagList(obj.themes, "theme", THEMES),
    note: obj.note === null ? undefined : obj.note,
  };
}

function normalizeTagList(list: unknown, key: string, valid: readonly string[]): unknown {
  if (!Array.isArray(list)) return list;
  return list
    .map((item) => {
      if (typeof item !== "object" || item === null) return item;
      const v = (item as Record<string, unknown>)[key];
      if (typeof v !== "string") return item;
      return { ...item, [key]: v.trim().toLowerCase().replace(/\s+/g, "_") };
    })
    .filter((item) => {
      if (typeof item !== "object" || item === null) return false;
      const v = (item as Record<string, unknown>)[key];
      return typeof v === "string" && valid.includes(v);
    });
}

const BLURB_MAX_CHARS = 360;

/**
 * blurbSchema's 40-360 character window has now missed from prompt wording alone in
 * both directions: first blurbs came back too short (fixed by tightening the prompt),
 * then that same tightened wording ("write a second, fuller sentence") pushed several
 * live blurbs over 360 instead. Rather than tune the prompt a third time, deterministically
 * truncate an overlong `text` at the last complete sentence within the limit - a repair
 * that holds regardless of how the model's wording drifts, the same reasoning as
 * normalizeClassificationJson dropping bad tags instead of re-wording the classify prompt
 * again. Falls back to a hard, ellipsis-terminated cut only if no sentence boundary
 * exists within the window at all.
 */
export function normalizeBlurbJson(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.text !== "string" || obj.text.length <= BLURB_MAX_CHARS) return raw;
  return { ...obj, text: truncateAtSentence(obj.text, BLURB_MAX_CHARS) };
}

/** Same casing-drift fix as normalizeTagList (e.g. "General"/"MATURE") for the
 * content-advisory call's single enum field. */
export function normalizeContentAdvisoryJson(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.rating !== "string") return raw;
  return { ...obj, rating: obj.rating.trim().toLowerCase() };
}

function truncateAtSentence(text: string, max: number): string {
  const window = text.slice(0, max);
  const match = /^[\s\S]*[.!?]/.exec(window);
  if (match) return match[0].trim();
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
