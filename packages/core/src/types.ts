import type { ContextNoteCategory, InclusionType, RepresentationHandling, Theme, TagSource } from "./taxonomy.js";

export type TitleKind = "film" | "series";
export type CreditRole = "director" | "writer" | "creator" | "cast";
export type SearchMode = "hybrid" | "lexical" | "semantic";

export interface Person {
  id: string;
  tmdbId: number | null;
  name: string;
  knownForDepartment: string | null;
}

export interface Credit {
  person: Person;
  role: CreditRole;
  character: string | null;
  order: number;
}

export interface Tag {
  kind: "inclusion_type" | "theme";
  slug: InclusionType | Theme;
  label: string;
  confidence: number;
  source: TagSource;
}

export interface Blurb {
  text: string;
  /** Grounding used to generate the blurb — shown as citations in the UI. */
  sources: BlurbSource[];
  model: string;
  approved: boolean;
}

export interface BlurbSource {
  kind: "synopsis" | "loc_filmography" | "ucla_guide" | "credit" | "award" | "criticism" | "news";
  ref: string;
  quote: string | null;
}

/**
 * A sourced caveat about how a title represents Latino people or communities.
 * Deliberately reuses BlurbSource's shape for sources rather than a parallel type —
 * same "cite what backs this" discipline that grounds the blurb pipeline.
 */
export interface ContextNote {
  category: ContextNoteCategory;
  /** "review_required" notes exist for editorial tracking but shouldn't read as settled. */
  status: "confirmed" | "review_required";
  summary: string;
  sources: BlurbSource[];
  /** curator_only notes are never returned by the public title endpoint. */
  displayPolicy: "public" | "curator_only";
}

export interface Title {
  id: string;
  tmdbId: number | null;
  imdbId: string | null;
  kind: TitleKind;
  title: string;
  originalTitle: string | null;
  yearStart: number;
  yearEnd: number | null;
  country: string[];
  language: string[];
  synopsis: string | null;
  posterKey: string | null;
  popularity: number;
  runtime: number | null;
  credits: Credit[];
  tags: Tag[];
  blurb: Blurb | null;
  /** null = standard entry, no known representation concern. */
  representationHandling: RepresentationHandling | null;
  contextNotes: ContextNote[];
}

/** Compact shape returned by /search — enough to render a card. */
export interface TitleCard {
  id: string;
  kind: TitleKind;
  title: string;
  yearStart: number;
  yearEnd: number | null;
  director: string | null;
  posterKey: string | null;
  blurbTeaser: string | null;
  inclusionTypes: InclusionType[];
  themes: Theme[];
  score: number;
  representationHandling: RepresentationHandling | null;
}

export interface SearchFilters {
  kind?: TitleKind;
  decade?: number; // e.g. 1990
  country?: string; // ISO 3166-1 alpha-2
  theme?: Theme;
  inclusionType?: InclusionType;
}

export interface SearchRequest {
  q: string;
  mode: SearchMode;
  filters: SearchFilters;
  limit: number;
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  /** Non-null when the LLM rewrote a natural-language query into structured filters. */
  interpretation: QueryInterpretation | null;
  results: TitleCard[];
  tookMs: number;
}

export interface QueryInterpretation {
  cleanedQuery: string;
  filters: SearchFilters;
  rationale: string;
  source: "llm" | "rules";
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: "curated" | "smart";
  items: TitleCard[];
}

export interface RankedHit {
  titleId: string;
  score: number;
}
