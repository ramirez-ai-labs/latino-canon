import type { LlmProvider } from "@latino-canon/core";

export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  DB: D1Database;
  POSTERS: R2Bucket;
  INGEST_WORKFLOW: Workflow<IngestParams>;

  LLM_PROVIDER: LlmProvider;
  AI_GATEWAY_ID: string;

  // secrets
  TMDB_API_KEY: string;
  OMDB_API_KEY: string;
  CF_ACCOUNT_ID: string;
  ANTHROPIC_API_KEY?: string;
  INGEST_ADMIN_TOKEN: string;
}

/** One workflow instance per title. */
export interface IngestParams {
  /** "Title (Year)" as written in the seed list, before TMDB resolution. */
  ref: string;
  title: string;
  year: number;
  kind: "film" | "series";
  /** Trusted inclusion types from the seed list; classifier still runs but seed wins. */
  seedInclusionTypes?: string[];
  /** Force re-run even if the title already exists. */
  force?: boolean;
}
