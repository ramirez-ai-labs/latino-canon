export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  DB: D1Database;
  CACHE: KVNamespace;
  POSTERS: R2Bucket;
  /** Absent in tests / local dev without the binding - see search.ts's cache key. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  /** Per-caller limit on neuron-spending searches - see rate-limit.ts. Absent in tests. */
  SEARCH_RATE_LIMITER?: RateLimit;

  AI_GATEWAY_ID: string;
  SEARCH_CACHE_TTL_SECONDS: string;
  /**
   * Which curation agent answers POST /agents/curate: "v1" (the fixed pipeline) or "v2" (a
   * model choosing tools, docs/design/AGENTIC_CURATION_V2.md). Anything else, or absent, is v1:
   * v2 becomes the default only after the curation eval's ship gate passes.
   */
  CURATE_AGENT?: string;
}
