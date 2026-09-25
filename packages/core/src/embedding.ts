import { THEME_LABELS, type Theme } from "./taxonomy.js";
import type { TitleKind } from "./types.js";

/**
 * The one definition of what a title's vector is made of and what metadata rides along
 * with it. This used to live in three places (ingest's upsertVector, an unused api
 * copy commented "keep in sync", and the api's since-removed /admin/rebuild-vectorize) - they had
 * already drifted, and the rebuild copy's metadata dropped `kind`/`decade`, which is
 * what filterToVectorize pushes down, so every rebuilt vector silently stopped matching
 * any kind/decade-filtered semantic query. Every writer to Vectorize goes through here.
 *
 * `themes` must already be confidence-gated by the caller (see MODEL_TAG_DISPLAY_THRESHOLD)
 * - a theme too uncertain to display shouldn't pull the vector toward it either.
 */
export function titleEmbeddingText(t: {
  title: string;
  originalTitle: string | null;
  synopsis: string | null;
  themes: readonly string[];
  genres: readonly string[];
}): string {
  const themeLabels = t.themes.map((slug) => THEME_LABELS[slug as Theme] ?? slug);
  return [
    t.title,
    t.originalTitle && t.originalTitle !== t.title ? t.originalTitle : null,
    t.synopsis,
    t.genres.length ? `Genres: ${t.genres.join(", ")}` : null,
    themeLabels.length ? `Themes: ${themeLabels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Scalar-only on purpose: Vectorize metadata filters have no "array contains" operator,
 * so array fields (countries/themes, stored here before) could never be filtered on.
 * These two are exactly what apps/api's filterToVectorize pushes down, and each has a
 * metadata index (infra/README.md).
 */
export function titleVectorMetadata(t: { kind: TitleKind; yearStart: number }): { kind: TitleKind; decade: number } {
  return { kind: t.kind, decade: Math.floor(t.yearStart / 10) * 10 };
}
