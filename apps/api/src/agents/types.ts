import type { PersonGender, QueryInterpretation, Theme, TitleCard, TitleKind } from "@latino-canon/core";

/**
 * theme/decade/country/kind reuse `rewriteQuery`'s own validated types directly
 * (Theme is the closed 14-slug taxonomy enum, not a free string) - the one thing
 * `rewriteQuery` doesn't extract is directorGender/tone, which this agent adds via
 * cheap keyword rules (see tools.ts's extractAgentOnlyIntent), not another LLM call.
 */
export interface ExtractedIntent {
  theme?: Theme;
  decade?: number;
  country?: string;
  kind?: TitleKind;
  directorGender?: PersonGender;
  /** Single axis, matching scoreTone's 0=opposite/1=target semantic - "serious" and
   * "comedic" don't actually resolve to a point on that axis, so unlike the original
   * design this doesn't pretend to support them. */
  tone?: "lighter" | "heavier";
  /** Set when rewriteQuery found nothing to extract at all (rare - most queries hit
   * either its rules pass or its LLM pass); the raw query is used for search as-is. */
  cleanedQuery: string;
  /** Did any part of this call an LLM, or was it fully rule-based? Surfaced in the
   * response so the reasoning trail can honestly say when it skipped the AI call
   * entirely - that's a real cost/latency win worth showing, not hiding. */
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

export interface CurationResponse {
  userQuery: string;
  interpretation: string;
  topResults: RankedTitle[];
  totalMatches: number;
  reasoning: string[];
  extractedIntent: ExtractedIntent;
  /** True when this response was served from cache without re-running search/AI. */
  cached: boolean;
}
