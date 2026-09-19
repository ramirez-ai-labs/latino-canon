import { Hono } from "hono";
import {
  MODEL_TAG_DISPLAY_THRESHOLD,
  type ContextNote,
  type ContextNoteCategory,
  type CreditRole,
  type InclusionType,
  type PersonGender,
  type RepresentationHandling,
  type TagSource,
  type Theme,
  type Title,
  type TitleKind,
} from "@latino-canon/core";
import type { Env } from "../bindings.js";

export const titlesRoute = new Hono<{ Bindings: Env }>();

/** GET /titles?hasBlurb=1 — enumerate title IDs, optionally filtered by blurb presence. */
titlesRoute.get("/", async (c) => {
  const hasBlurb = c.req.query("hasBlurb") === "1";
  const limit = Math.min(Number(c.req.query("limit") || "1000"), 10000);

  const sql = hasBlurb
    ? "SELECT DISTINCT t.id FROM titles t INNER JOIN blurbs b ON t.id = b.title_id WHERE b.approved = 1 ORDER BY t.title ASC LIMIT ?"
    : "SELECT id FROM titles ORDER BY title ASC LIMIT ?";

  const { results } = await c.env.DB.prepare(sql).bind(limit).all<{ id: string }>();
  return c.json({
    titleIds: results.map((r) => r.id),
    count: results.length,
    limited: results.length === limit,
  });
});

interface TitleRow {
  id: string;
  tmdb_id: number | null;
  imdb_id: string | null;
  kind: TitleKind;
  title: string;
  original_title: string | null;
  year_start: number;
  year_end: number | null;
  countries: string;
  languages: string;
  synopsis: string | null;
  poster_key: string | null;
  popularity: number;
  runtime: number | null;
  representation_handling: RepresentationHandling | null;
  oscar_win: string | null;
}
interface CreditRow {
  person_id: string;
  tmdb_id: number | null;
  name: string;
  known_for_department: string | null;
  gender: PersonGender | null;
  role: CreditRole;
  character: string | null;
  ord: number;
}
interface TagRow {
  kind: "inclusion_type" | "theme";
  slug: string;
  label: string;
  confidence: number;
  source: TagSource;
}
interface BlurbRow {
  text: string;
  sources: string;
  model: string;
  approved: number;
}
interface ContextNoteRow {
  category: ContextNoteCategory;
  status: "confirmed" | "review_required";
  summary: string;
  sources: string;
}

/**
 * GET /titles/:id — full Title (metadata + credits + tags + approved blurb with sources).
 *
 * Four small parallel queries rather than one join: title/credits/tags/blurb are each a
 * different fan-out shape (1:1, 1:many, 1:many, 0:1) - one mega-query would need
 * app-side de-duplication across the joins anyway, so separate queries are simpler and
 * no slower for a single-title read.
 */
titlesRoute.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [title, credits, tags, blurb, contextNotes] = await Promise.all([
    // Same public-visibility gate as hydrateCards (db/cards.ts): a title with no
    // qualifying inclusion_type tag isn't part of the canon yet, so it 404s here too -
    // not just missing from listings while still reachable by direct URL.
    c.env.DB.prepare(
      `SELECT t.* FROM titles t WHERE t.id = ?1
       AND EXISTS (
         SELECT 1 FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
         WHERE tt.title_id = t.id AND g.kind = 'inclusion_type'
           AND (tt.source != 'model' OR tt.confidence >= ?2)
       )`,
    )
      .bind(id, MODEL_TAG_DISPLAY_THRESHOLD)
      .first<TitleRow>(),
    c.env.DB.prepare(
      `SELECT p.id AS person_id, p.tmdb_id, p.name, p.known_for_department, p.gender, c.role, c.character, c.ord
       FROM credits c JOIN people p ON p.id = c.person_id
       WHERE c.title_id = ?1 ORDER BY c.role, c.ord`,
    )
      .bind(id)
      .all<CreditRow>(),
    c.env.DB.prepare(
      `SELECT g.kind, g.slug, g.label, tt.confidence, tt.source
       FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
       WHERE tt.title_id = ?1`,
    )
      .bind(id)
      .all<TagRow>(),
    c.env.DB.prepare("SELECT text, sources, model, approved FROM blurbs WHERE title_id = ?1 ORDER BY approved DESC LIMIT 1")
      .bind(id)
      .first<BlurbRow>(),
    // display_policy = 'curator_only' notes exist for editorial tracking and are never
    // returned by this public endpoint.
    c.env.DB.prepare(
      `SELECT category, status, summary, sources FROM title_context_notes
       WHERE title_id = ?1 AND display_policy = 'public'`,
    )
      .bind(id)
      .all<ContextNoteRow>(),
  ]);

  if (!title) return c.json({ error: "not found" }, 404);

  const body: Title = {
    id: title.id,
    tmdbId: title.tmdb_id,
    imdbId: title.imdb_id,
    kind: title.kind,
    title: title.title,
    originalTitle: title.original_title,
    yearStart: title.year_start,
    yearEnd: title.year_end,
    country: JSON.parse(title.countries) as string[],
    language: JSON.parse(title.languages) as string[],
    synopsis: title.synopsis,
    posterKey: title.poster_key,
    popularity: title.popularity,
    runtime: title.runtime,
    credits: credits.results.map((r) => ({
      person: {
        id: r.person_id,
        tmdbId: r.tmdb_id,
        name: r.name,
        knownForDepartment: r.known_for_department,
        gender: r.gender,
      },
      role: r.role,
      character: r.character,
      order: r.ord,
    })),
    tags: tags.results.map((t) => ({
      kind: t.kind,
      slug: t.slug as InclusionType | Theme,
      label: t.label,
      confidence: t.confidence,
      source: t.source,
    })),
    blurb: blurb
      ? {
          text: blurb.text,
          sources: JSON.parse(blurb.sources),
          model: blurb.model,
          approved: Boolean(blurb.approved),
        }
      : null,
    representationHandling: title.representation_handling,
    oscarWin: title.oscar_win,
    contextNotes: contextNotes.results.map(
      (n): ContextNote => ({
        category: n.category,
        status: n.status,
        summary: n.summary,
        sources: JSON.parse(n.sources),
        displayPolicy: "public",
      }),
    ),
  };

  return c.json(body);
});

/** GET /titles/:id/similar — content-based neighbors from Vectorize (V1). */
titlesRoute.get("/:id/similar", (c) => c.json({ todo: "vectorize nearest-neighbors by title id", results: [] }));
