import type { ClassificationResult, Title } from "@latino-canon/core";
import type { BlurbGroundingResult } from "./ai.js";
import { EMBEDDING_MODEL } from "@latino-canon/core";
import type { AliasKind, Env } from "./bindings.js";
import { embedText } from "./ai.js";

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
    // contentless FTS5: delete-then-insert by rowid keyed on titles.rowid. `aliases`
    // is read live from title_aliases (via subquery, not the in-memory Title) so a
    // re-persist here never clobbers aliases written separately by writeAliases.
    env.DB.prepare(
      `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
       SELECT rowid, ?2, ?3, ?4, ?5, ?6,
         COALESCE((SELECT GROUP_CONCAT(a.alias, ', ') FROM title_aliases a WHERE a.title_id = ?1), '')
       FROM titles WHERE id = ?1`,
    ).bind(t.id, t.title, t.originalTitle ?? "", t.synopsis ?? "", peopleText(t), ""),
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

  await env.DB.batch(statements);
}

function peopleText(t: Title): string {
  return t.credits.map((c) => c.person.name).join(", ");
}

/** Embed with bge-m3 and upsert into Vectorize with metadata for filter push-down. */
export async function upsertVector(env: Env, t: Title, themes: string[]): Promise<void> {
  const text = [t.title, t.originalTitle, t.synopsis, themes.length ? `Themes: ${themes.join(", ")}` : null]
    .filter(Boolean)
    .join("\n");
  const values = await embedText(env, text);
  await env.VECTORIZE.upsert([
    {
      id: t.id,
      values,
      metadata: {
        kind: t.kind,
        decade: Math.floor(t.yearStart / 10) * 10,
        countries: t.country,
        themes,
        // inclusionTypes filled by writeTags via a follow-up upsert, or recompute here
      },
    },
  ]);
  void EMBEDDING_MODEL;
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

  if (statements.length) await env.DB.batch(statements);
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
  const aliasesText = aliases.map((a) => a.alias).join(", ");
  const statements = [
    env.DB.prepare(`DELETE FROM title_aliases WHERE title_id = ?1`).bind(titleId),
    ...aliases.map((a) =>
      env.DB.prepare(`INSERT INTO title_aliases (title_id, alias, kind) VALUES (?1, ?2, ?3)`).bind(
        titleId,
        a.alias,
        a.kind,
      ),
    ),
    env.DB.prepare(
      `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags, aliases)
       SELECT
         t.rowid, t.title, COALESCE(t.original_title, ''), COALESCE(t.synopsis, ''),
         COALESCE((SELECT GROUP_CONCAT(p.name, ', ') FROM credits c JOIN people p ON p.id = c.person_id WHERE c.title_id = t.id), ''),
         '',
         ?2
       FROM titles t WHERE t.id = ?1`,
    ).bind(titleId, aliasesText),
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
         WHEN blurbs.text = excluded.text AND blurbs.sources = excluded.sources THEN blurbs.approved
         ELSE 0
       END`,
  )
    .bind(titleId, blurb.result.text, JSON.stringify(blurb.sources), blurb.model)
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
