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

export interface CurationResponse {
  userQuery: string;
  interpretation: string;
  topResults: RankedTitle[];
  totalMatches: number;
  reasoning: string[];
  extractedIntent: ExtractedIntent;
  cached: boolean;
}
