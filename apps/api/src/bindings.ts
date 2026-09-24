export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  DB: D1Database;
  CACHE: KVNamespace;
  POSTERS: R2Bucket;
  /** Absent in tests / local dev without the binding - see search.ts's cache key. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;

  AI_GATEWAY_ID: string;
  SEARCH_CACHE_TTL_SECONDS: string;
}
