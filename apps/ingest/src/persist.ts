import {
  MODEL_TAG_DISPLAY_THRESHOLD,
  titleEmbeddingText,
  titleVectorMetadata,
  type ClassificationResult,
  type ContentAdvisory,
  type Title,
} from "@latino-canon/core";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import type { BlurbGroundingResult } from "./ai.js";
import type { AliasKind, Env } from "./bindings.js";
import { embedText, embedTexts } from "./ai.js";

/** Upsert the row + rebuild its FTS entry + upsert people/credits. */
export async function persistTitle(env: Env, t: Title): Promise<void> {
  const statements = [
    env.DB.prepare(
      `INSERT INTO titles (id, tmdb_id, imdb_id, kind, title, original_title, year_start, year_end,
         countries, languages, synopsis, popularity, runtime, genres, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         synopsis=excluded.synopsis, popularity=excluded.popularity, genres=excluded.genres, updated_at=datetime('now')`,
    ).bind(
      t.id, t.tmdbId, t.imdbId, t.kind, t.title, t.originalTitle, t.yearStart, t.yearEnd,
      JSON.stringify(t.country), JSON.stringify(t.language), t.synopsis, t.popularity, t.runtime,
      JSON.stringify(t.genres),
    ),
    // re-ingest is idempotent: drop this title's credits and rebuild from the fresh fetch
    env.DB.prepare(`DELETE FROM credits WHERE title_id = ?1`).bind(t.id),
  ];

  for (const c of t.credits) {
    statements.push(
      env.DB.prepare(
        // COALESCE on gender, not a plain overwrite: this project didn't capture gender
        // before this column existed, and a later re-fetch that (rarely) comes back
        // without it shouldn't clobber a value a previous ingest already captured.
        `INSERT INTO people (id, tmdb_id, name, known_for_department, gender)
         VALUES (?1,?2,?3,?4,?5)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, gender = COALESCE(excluded.gender, people.gender)`,
      ).bind(c.person.id, c.person.tmdbId, c.person.name, c.person.knownForDepartment, c.person.gender),
    );
  }
  for (const c of t.credits) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO credits (title_id, person_id, role, character, ord) VALUES (?1,?2,?3,?4,?5)`,
      ).bind(t.id, c.person.id, c.role, c.character, c.order),
    );
  }

  // Last, so the people subquery sees the credits just rewritten above.
  statements.push(...reindexFts(env, t.id));
  await env.DB.batch(statements);
}

/**
 * Rebuild one title's titles_fts row entirely from D1 - title/synopsis from `titles`,
 * people from credits, confident tag labels + genres, aliases - so no writer has to
 * know about the columns it isn't changing. Delete-then-insert, which only works on a
 * regular (not contentless) FTS5 table; see migration 0022 for why a contentless one
 * kept stale text searchable. Call it after any write to data the index includes.
 */
export function reindexFts(env: Env, titleId: string): D1PreparedStatement[] {
  return [
    env.DB.prepare(`DELETE FROM titles_fts WHERE rowid = (SELECT rowid FROM titles WHERE id = ?1)`).bind(titleId),
    env.DB.prepare(
      `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
       SELECT
         t.rowid, t.title, COALESCE(t.original_title, ''), COALESCE(t.synopsis, ''),
         COALESCE((SELECT GROUP_CONCAT(p.name, ', ') FROM credits c JOIN people p ON p.id = c.person_id WHERE c.title_id = t.id), ''),
         TRIM(
           COALESCE((
             SELECT GROUP_CONCAT(g.label, ', ') FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
             WHERE tt.title_id = t.id AND (tt.source != 'model' OR tt.confidence >= ?2)
           ), '')
           || ' ' ||
           COALESCE((SELECT GROUP_CONCAT(value, ', ') FROM json_each(t.genres)), '')
         ),
         COALESCE((SELECT GROUP_CONCAT(a.alias, ', ') FROM title_aliases a WHERE a.title_id = t.id), '')
       FROM titles t WHERE t.id = ?1`,
    ).bind(titleId, MODEL_TAG_DISPLAY_THRESHOLD),
  ];
}

/** Embed with bge-m3 and upsert into Vectorize. `themes` must already be confidence-gated. */
export async function upsertVector(env: Env, t: Title, themes: string[]): Promise<void> {
  const values = await embedText(
    env,
    titleEmbeddingText({ title: t.title, originalTitle: t.originalTitle, synopsis: t.synopsis, themes, genres: t.genres }),
  );
  await env.VECTORIZE.upsert([{ id: t.id, values, metadata: titleVectorMetadata(t) }]);
}

/**
 * Re-embed one page of the catalog from D1, the same way ingest does. Paged because the
 * ingest worker has a per-request subrequest budget: one D1 read, one batched embed call
 * and one batched upsert per page, not a Vectorize call per title (which is what hit
 * VECTOR_UPSERT_ERROR 40041 "Too Many Requests" in the old api-side rebuild).
 */
export async function rebuildVectors(
  env: Env,
  offset: number,
  limit: number,
): Promise<{ embedded: number; total: number; nextOffset: number | null }> {
  const { results: rows } = await env.DB.prepare(
    `SELECT t.id, t.kind, t.title, t.original_title, t.synopsis, t.year_start, t.genres,
       (SELECT json_group_array(g.slug) FROM title_tags tt JOIN tags g ON g.id = tt.tag_id
        WHERE tt.title_id = t.id AND g.kind = 'theme'
          AND (tt.source != 'model' OR tt.confidence >= ?3)) AS themes
     FROM titles t ORDER BY t.id LIMIT ?1 OFFSET ?2`,
  )
    .bind(limit, offset, MODEL_TAG_DISPLAY_THRESHOLD)
    .all<{
      id: string;
      kind: Title["kind"];
      title: string;
      original_title: string | null;
      synopsis: string | null;
      year_start: number;
      genres: string | null;
      themes: string;
    }>();
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM titles").first<{ n: number }>())?.n ?? 0;
  if (rows.length === 0) return { embedded: 0, total, nextOffset: null };

  const vectors = await embedTexts(
    env,
    rows.map((r) =>
      titleEmbeddingText({
        title: r.title,
        originalTitle: r.original_title,
        synopsis: r.synopsis,
        themes: JSON.parse(r.themes) as string[],
        genres: JSON.parse(r.genres ?? "[]") as string[],
      }),
    ),
  );
  await env.VECTORIZE.upsert(
    rows.map((r, i) => ({
      id: r.id,
      values: vectors[i]!,
      metadata: titleVectorMetadata({ kind: r.kind, yearStart: r.year_start }),
    })),
  );

  const next = offset + rows.length;
  return { embedded: rows.length, total, nextOffset: next < total ? next : null };
}

/**
 * Precedence, enforced by the ON CONFLICT guard rather than write order alone:
 * editor > seed > model. Seed can promote a tag the classifier missed or scored low;
 * a later re-classification can only refresh a tag *it* previously wrote, never
 * downgrade a seed or editor call. Themes have no seed concept, so they're
 * always source='model'.
 *
 * VALIDATION: Require at least one valid inclusion_type (led_by, created_by, about_community, or breakthrough).
 * This prevents misclassified non-Latino films from entering the canon.
 */
export async function writeTags(
  env: Env,
  titleId: string,
  input: { classification: ClassificationResult; seedInclusionTypes: string[] },
): Promise<void> {
  // Validate: title must have at least one inclusion_type from seed or classifier
  const hasValidInclusionType =
    input.seedInclusionTypes.length > 0 ||
    input.classification.inclusionTypes.length > 0;

  if (!hasValidInclusionType) {
    console.warn(`[writeTags] Skipping ${titleId}: no valid inclusion_type found. Title does not meet Latino Canon criteria.`);
    return;
  }
  const { results: tagRows } = await env.DB.prepare(`SELECT id, kind, slug FROM tags`).all<{
    id: number;
    kind: "inclusion_type" | "theme";
    slug: string;
  }>();
  const tagId = (kind: "inclusion_type" | "theme", slug: string) =>
    tagRows.find((t) => t.kind === kind && t.slug === slug)?.id;

  const upsert = (tagRowId: number, confidence: number, source: "seed" | "model", keepUnless: string) =>
    env.DB.prepare(
      `INSERT INTO title_tags (title_id, tag_id, confidence, source)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(title_id, tag_id) DO UPDATE SET confidence = excluded.confidence, source = excluded.source
       WHERE title_tags.source ${keepUnless}`,
    ).bind(titleId, tagRowId, confidence, source);

  const statements = [];

  for (const slug of input.seedInclusionTypes) {
    const id = tagId("inclusion_type", slug);
    if (id) statements.push(upsert(id, 1.0, "seed", "!= 'editor'"));
  }
  for (const t of input.classification.inclusionTypes) {
    const id = tagId("inclusion_type", t.type);
    if (id) statements.push(upsert(id, t.confidence, "model", "= 'model'"));
  }
  for (const t of input.classification.themes ?? []) {
    const id = tagId("theme", t.theme);
    if (id) statements.push(upsert(id, t.confidence, "model", "= 'model'"));
  }

  // Tag labels feed titles_fts's `tags` column.
  statements.push(...reindexFts(env, titleId));
  await env.DB.batch(statements);
}

/**
 * Direct column write, not a title_tags upsert - content_advisory is a single scalar
 * per title (see migration 0020), not a multi-valued tag. Unconditional overwrite: a
 * re-classification is always meant to replace the previous judgment, unlike
 * writeTags' seed/model/editor precedence for a value multiple sources can supply.
 */
export async function writeContentAdvisory(env: Env, titleId: string, rating: ContentAdvisory): Promise<void> {
  await env.DB.prepare("UPDATE titles SET content_advisory = ? WHERE id = ?").bind(rating, titleId).run();
}

/**
 * Overwrite semantics, not append: re-running this with a shorter list removes
 * aliases that are no longer current, same as persistTitle's own delete-then-insert
 * pattern for credits. Safe to call independently of persistTitle (e.g. a one-off
 * backfill for a title already in production) - it reads title/original_title/
 * synopsis/people live from D1 rather than requiring the caller to have a Title
 * object on hand.
 */
export async function writeAliases(
  env: Env,
  titleId: string,
  aliases: { alias: string; kind: AliasKind }[],
): Promise<void> {
  const statements = [
    env.DB.prepare(`DELETE FROM title_aliases WHERE title_id = ?1`).bind(titleId),
    ...aliases.map((a) =>
      env.DB.prepare(`INSERT INTO title_aliases (title_id, alias, kind) VALUES (?1, ?2, ?3)`).bind(
        titleId,
        a.alias,
        a.kind,
      ),
    ),
    ...reindexFts(env, titleId),
  ];
  await env.DB.batch(statements);
}

export async function writeBlurb(env: Env, titleId: string, blurb: BlurbGroundingResult): Promise<void> {
  // Re-ingesting a title (e.g. a metadata fix unrelated to the blurb) must not silently
  // discard an editor's prior approval - only reset it when the text or its grounding
  // sources actually changed. Found the hard way: every re-ingest was resetting
  // approved -> 0 unconditionally, which combined with a run of metadata-fix PRs wiped
  // out the whole catalog's approval state without anyone noticing.
  await env.DB.prepare(
    `INSERT INTO blurbs (title_id, text, sources, model, approved)
     VALUES (?1, ?2, ?3, ?4, 0)
     ON CONFLICT(title_id) DO UPDATE SET
       text=excluded.text,
       sources=excluded.sources,
       model=excluded.model,
       approved = CASE
         WHEN blurbs.text = excluded.text AND blurbs.sources IN (excluded.sources, ?5) THEN blurbs.approved
         ELSE 0
       END`,
  )
    // ?5: the same sources in the pre-id/text format ({kind, ref, quote}) - storing id +
    // text changed the serialization, not the grounding, so it mustn't reset approval.
    .bind(
      titleId,
      blurb.result.text,
      JSON.stringify(blurb.sources),
      blurb.model,
      JSON.stringify(blurb.sources.map(({ kind, ref, quote }) => ({ kind, ref, quote }))),
    )
    .run();
}

export async function setJob(
  env: Env,
  id: string,
  ref: string,
  stage: string,
  status: "pending" | "running" | "needs_review" | "done" | "error",
  errorMessage: string | null = null,
  params?: unknown,
): Promise<void> {
  // params is only ever passed on "register job" (the workflow's own IngestParams) -
  // every later call in the same run omits it, and COALESCE keeps the row's original
  // value instead of nulling it out on each subsequent status update.
  const paramsJson = params !== undefined ? JSON.stringify(params) : null;
  await env.DB.prepare(
    `INSERT INTO ingest_jobs (id, title_ref, stage, status, error, params, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       stage=excluded.stage, status=excluded.status, error=excluded.error,
       params=COALESCE(excluded.params, ingest_jobs.params), updated_at=datetime('now')`,
  )
    .bind(id, ref, stage, status, errorMessage, paramsJson)
    .run();
}
