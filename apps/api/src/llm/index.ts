import type { LlmClient } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { WorkersAiClient } from "./workers-ai.js";
import { AnthropicClient } from "./anthropic.js";

/**
 * Pick the provider from config. Runtime code should default to workers-ai;
 * offline batch jobs (apps/ingest) may set LLM_PROVIDER=anthropic.
 */
export function makeLlmClient(env: Env): LlmClient {
  if (env.LLM_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY unset");
    return new AnthropicClient(env.ANTHROPIC_API_KEY, env.CF_ACCOUNT_ID, env.AI_GATEWAY_ID);
  }
  return new WorkersAiClient(env.AI, env.CF_ACCOUNT_ID, env.AI_GATEWAY_ID);
}
