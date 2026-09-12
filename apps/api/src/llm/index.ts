import type { LlmClient } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { WorkersAiClient } from "./workers-ai.js";

/** Workers AI only, by design - no closed-model provider in this project. */
export function makeLlmClient(env: Env): LlmClient {
  return new WorkersAiClient(env.AI, env.AI_GATEWAY_ID);
}
