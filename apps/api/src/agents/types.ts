import type { TitleCard } from "@latino-canon/core";

export interface AgentState {
  userQuery: string;
  extractedIntent: ExtractedIntent | null;
  searchResults: Record<string, TitleCard[]>;
  filteredResults: TitleCard[];
  finalRanking: RankedTitle[];
  reasoning: string[];
  error: string | null;
}

export interface ExtractedIntent {
  theme?: string;
  decade?: number;
  directorGender?: "male" | "female" | "non-binary";
  tone?: string;
  country?: string;
  kind?: "film" | "series" | "special";
  additionalContext?: string;
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
  explainReasoning?: boolean;
}

export interface CurationResponse {
  userQuery: string;
  interpretation: string;
  topResults: RankedTitle[];
  totalMatches: number;
  reasoning: string[];
  extractedIntent: ExtractedIntent;
}
