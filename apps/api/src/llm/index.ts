import type { LlmClient, ToolCallingClient } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { WorkersAiClient } from "./workers-ai.js";

/** Workers AI only, by design - no closed-model provider in this project. */
export function makeLlmClient(env: Env): LlmClient {
  return new WorkersAiClient(env.AI, env.AI_GATEWAY_ID);
}

/** The curation agent v2's model client - the same Workers AI client, through AI Gateway. */
export function makeToolClient(env: Env): ToolCallingClient {
  return new WorkersAiClient(env.AI, env.AI_GATEWAY_ID);
}
