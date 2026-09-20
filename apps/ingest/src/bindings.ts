export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  DB: D1Database;
  POSTERS: R2Bucket;
  INGEST_WORKFLOW: Workflow<IngestParams>;

  AI_GATEWAY_ID: string;

  // secrets
  TMDB_API_KEY: string;
  OMDB_API_KEY: string;
  INGEST_ADMIN_TOKEN: string;
}

/** One workflow instance per title. */
export interface IngestParams {
  /** "Title (Year)" as written in the seed list, before TMDB resolution. */
  ref: string;
  title: string;
  year: number;
  kind: "film" | "series" | "special";
  /** Pins the exact TMDB id, skipping search - for titles whose title+year search
   * result collides with an unrelated, same-titled, same-year work. */
  tmdbId?: number;
  /** Trusted inclusion types from the seed list; classifier still runs but seed wins. */
  seedInclusionTypes?: string[];
  /** Force re-run even if the title already exists. */
  force?: boolean;
}
