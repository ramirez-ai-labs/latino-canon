import type { LlmProvider } from "@latino-canon/core";

export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  DB: D1Database;
  CACHE: KVNamespace;
  POSTERS: R2Bucket;

  LLM_PROVIDER: LlmProvider;
  AI_GATEWAY_ID: string;
  SEARCH_CACHE_TTL_SECONDS: string;

  // secrets
  CF_ACCOUNT_ID: string;
  ANTHROPIC_API_KEY?: string;
}
