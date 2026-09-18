import { z } from "zod";
import { CONTEXT_NOTE_CATEGORIES, INCLUSION_TYPES, REPRESENTATION_HANDLINGS, THEMES } from "./taxonomy.js";

export const titleKindSchema = z.enum(["film", "series", "special"]);
export const searchModeSchema = z.enum(["hybrid", "lexical", "semantic"]);
export const inclusionTypeSchema = z.enum(INCLUSION_TYPES);
export const themeSchema = z.enum(THEMES);
export const representationHandlingSchema = z.enum(REPRESENTATION_HANDLINGS);
export const contextNoteCategorySchema = z.enum(CONTEXT_NOTE_CATEGORIES);

/** Editor-authored, not model output — no ingest pipeline writes this yet. */
export const contextNoteSchema = z.object({
  category: contextNoteCategorySchema,
  status: z.enum(["confirmed", "review_required"]),
  summary: z.string().min(1).max(500),
  sources: z.array(
    z.object({
      kind: z.enum(["synopsis", "loc_filmography", "ucla_guide", "credit", "award", "criticism", "news"]),
      ref: z.string(),
      quote: z.string().nullable(),
    }),
  ),
  displayPolicy: z.enum(["public", "curator_only"]),
});

export const searchFiltersSchema = z.object({
  kind: titleKindSchema.optional(),
  decade: z.number().int().min(1900).max(2100).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  theme: themeSchema.optional(),
  inclusionType: inclusionTypeSchema.optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  mode: searchModeSchema.default("hybrid"),
  // apps/web's /catalog and /search pages request PER_PAGE + 1 (50 + 1) to detect
  // whether a next page exists without a separate count query - a limit cap equal to
  // PER_PAGE rejects that request outright (400) on every single page load. Cap here
  // one above web's current PER_PAGE, not equal to it.
  limit: z.coerce.number().int().min(1).max(51).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  kind: titleKindSchema.optional(),
  decade: z.coerce.number().int().optional(),
  country: z.string().length(2).optional(),
  theme: themeSchema.optional(),
  inclusionType: inclusionTypeSchema.optional(),
});

/** Structured output contract for the query-rewriting LLM call. */
export const queryInterpretationSchema = z.object({
  cleanedQuery: z.string(),
  filters: searchFiltersSchema,
  rationale: z.string().max(280),
});

/** Structured output contract for the classifier LLM call. */
export const classificationSchema = z.object({
  inclusionTypes: z
    .array(z.object({ type: inclusionTypeSchema, confidence: z.number().min(0).max(1) }))
    .max(6), // = INCLUSION_TYPES.length; this was max(4) when there were only 4 possible values
  themes: z
    .array(z.object({ theme: themeSchema, confidence: z.number().min(0).max(1) }))
    .max(6)
    .optional(),
  note: z.string().max(280).optional(),
});

/** Structured output contract for the "why it matters" blurb call. */
export const blurbSchema = z.object({
  text: z.string().min(40).max(360),
  claims: z.array(
    z.object({
      claim: z.string(),
      supportedBy: z.string().describe("id of the source snippet this claim rests on"),
    }),
  ),
});

export const feedbackSchema = z.object({
  titleId: z.string(),
  kind: z.enum(["blurb_helpful", "wrong_inclusion", "missing_title"]),
  value: z.union([z.boolean(), z.string().max(500)]),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type ClassificationResult = z.infer<typeof classificationSchema>;
export type BlurbResult = z.infer<typeof blurbSchema>;
