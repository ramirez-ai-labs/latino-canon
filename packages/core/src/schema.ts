import { z } from "zod";
import { INCLUSION_TYPES, THEMES } from "./taxonomy.js";

export const titleKindSchema = z.enum(["film", "series"]);
export const searchModeSchema = z.enum(["hybrid", "lexical", "semantic"]);
export const inclusionTypeSchema = z.enum(INCLUSION_TYPES);
export const themeSchema = z.enum(THEMES);

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
  limit: z.coerce.number().int().min(1).max(50).default(24),
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
    .max(6),
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
