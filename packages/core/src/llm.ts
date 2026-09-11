/**
 * Provider abstraction so the runtime path can stay on free Workers AI while the
 * offline path (blurb generation) can opt into Claude for quality. Both routes go
 * through AI Gateway for caching + observability.
 */

export type LlmProvider = "workers-ai" | "anthropic";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallOptions {
  /** Logical task name — surfaces in AI Gateway metadata and picks the model tier. */
  task: "query-rewrite" | "classify" | "blurb" | "judge";
  messages: LlmMessage[];
  /** Ask the model for strict JSON. Callers still validate with zod. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
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

/** Model choice per task per provider. Keep runtime tasks small/cheap. */
export const MODELS: Record<LlmProvider, Record<LlmCallOptions["task"], string>> = {
  "workers-ai": {
    "query-rewrite": "@cf/meta/llama-3.1-8b-instruct",
    classify: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    blurb: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    judge: "@cf/meta/llama-3.1-8b-instruct",
  },
  anthropic: {
    "query-rewrite": "claude-haiku-4-5",
    classify: "claude-haiku-4-5",
    blurb: "claude-sonnet-5",
    judge: "claude-haiku-4-5",
  },
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
  return JSON.parse(candidate.slice(start, end + 1));
}
