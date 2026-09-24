import { MODEL_TAG_DISPLAY_THRESHOLD } from "@latino-canon/core";

/**
 * Pure decision logic extracted out of IngestWorkflow.run() so the highest-risk
 * branches - the exact two bugs found and fixed this session - are directly
 * unit-testable without needing a Workflow runtime, D1, or network access at all.
 */

/** Deterministic job id from a title ref, e.g. "El Chavo del 8 (1973)" -> "job_el_chavo_del_8_1973_". */
export function jobIdFor(ref: string): string {
  return `job_${ref.replace(/\W+/g, "_").toLowerCase()}`;
}

/**
 * A pinned tmdbId skips search entirely, so nothing else checks it actually points
 * at the right title. Found the hard way: El Chavo del 8 (1973)'s seed entry had a
 * wrong tmdbId that actually resolves to Firefly (2002) - an unrelated title already
 * in the catalog - and a force:true re-ingest silently overwrote Firefly's real tags
 * with El Chavo's seedInclusionTypes. A release-year mismatch this large can only
 * mean the pinned id is wrong, not that TMDB's data is imprecise.
 */
export function isYearMismatch(pinnedTmdbId: number | undefined, expectedYear: number, actualYear: number): boolean {
  return Boolean(pinnedTmdbId) && Math.abs(actualYear - expectedYear) > 2;
}

/**
 * A title with a seed-sourced inclusion_type doesn't need the model's own confidence
 * to justify inclusion - that's the entire point of seed trust outranking model
 * output (packages/core/src/taxonomy.ts). Found live: two titles with real
 * seedInclusionTypes (El Chavo del 8, The Dead Girls) sat in needs_review
 * indefinitely because this only ever looked at the model's raw classification, even
 * after their seed tags were correctly written to title_tags with confidence 1.0 -
 * the review queue disagreed with the data.
 */
export function needsHumanReview(
  seedInclusionTypes: string[] | undefined,
  modelInclusionTypes: { type: string; confidence: number }[],
): boolean {
  return (
    (seedInclusionTypes ?? []).length === 0 &&
    (modelInclusionTypes.length === 0 ||
      modelInclusionTypes.every((t) => t.confidence < MODEL_TAG_DISPLAY_THRESHOLD))
  );
}

/**
 * Themes the classifier is confident enough about to display - the only ones that go
 * into the embedding text. Same threshold (and same source of truth) as rebuildVectors'
 * D1 query and titles_fts's tags column, so a re-embed never disagrees with ingest.
 */
export function confidentThemes(themes: { theme: string; confidence: number }[] | undefined): string[] {
  return (themes ?? []).filter((t) => t.confidence >= MODEL_TAG_DISPLAY_THRESHOLD).map((t) => t.theme);
}
