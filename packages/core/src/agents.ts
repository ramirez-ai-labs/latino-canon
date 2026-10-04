import type { TitleCard, TitleKind, QueryInterpretation } from "./types.js";
import type { ContentAdvisory, Genre, PersonGender, Theme } from "./taxonomy.js";

export interface ExtractedIntent {
  theme?: Theme;
  decade?: number;
  country?: string;
  kind?: TitleKind;
  genre?: Genre;
  contentAdvisory?: ContentAdvisory;
  directorGender?: PersonGender;
  /** Lead/starring actor's gender - a distinct signal from directorGender, e.g.
   * "female director with a female lead" asks for both independently. */
  leadGender?: PersonGender;
  tone?: "lighter" | "heavier";
  cleanedQuery: string;
  source: QueryInterpretation["source"] | "none";
}

export interface RankedTitle {
  title: TitleCard;
  score: number;
  matchedCriteria: string[];
  reason: string;
}

export interface CurationRequest {
  query: string;
  limit?: number;
}

/** One tool call the v2 agent made, in order (docs/design/AGENTIC_CURATION_V2.md). */
export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  /** Titles the call returned; 0 for an error. */
  resultCount: number;
  ms: number;
  error?: string;
}

export interface CurationResponse {
  userQuery: string;
  interpretation: string;
  topResults: RankedTitle[];
  totalMatches: number;
  reasoning: string[];
  extractedIntent: ExtractedIntent;
  cached: boolean;
  /** Which agent answered. Absent on responses cached before v2 existed, which were v1's. */
  agentVersion?: "v1" | "v2";
  /** Why v2 handed the request to v1 (model error, step limit, daily cap...). */
  fallbackReason?: string;
  /** v2's tool calls, in order. */
  steps?: AgentStep[];
}
