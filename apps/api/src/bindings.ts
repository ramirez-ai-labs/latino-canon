export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  DB: D1Database;
  CACHE: KVNamespace;
  POSTERS: R2Bucket;

  AI_GATEWAY_ID: string;
  SEARCH_CACHE_TTL_SECONDS: string;
}
