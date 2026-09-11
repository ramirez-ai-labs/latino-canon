import type { ClassificationResult, Title } from "@latino-canon/core";
import type { BlurbGroundingResult } from "./ai.js";
import { EMBEDDING_MODEL } from "@latino-canon/core";
import type { Env } from "./bindings.js";
import { embedText } from "./ai.js";

/** Upsert the row + rebuild its FTS entry + upsert people/credits. */
export async function persistTitle(env: Env, t: Title): Promise<void> {
  const statements = [
    env.DB.prepare(
      `INSERT INTO titles (id, tmdb_id, imdb_id, kind, title, original_title, year_start, year_end,
         countries, languages, synopsis, popularity, runtime, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         synopsis=excluded.synopsis, popularity=excluded.popularity, updated_at=datetime('now')`,
    ).bind(
      t.id, t.tmdbId, t.imdbId, t.kind, t.title, t.originalTitle, t.yearStart, t.yearEnd,
      JSON.stringify(t.country), JSON.stringify(t.language), t.synopsis, t.popularity, t.runtime,
    ),
    // contentless FTS5: delete-then-insert by rowid keyed on titles.rowid
    env.DB.prepare(
      `INSERT INTO titles_fts (rowid, title, original_title, synopsis, people, tags)
       SELECT rowid, ?2, ?3, ?4, ?5, ?6 FROM titles WHERE id = ?1`,
    ).bind(t.id, t.title, t.originalTitle ?? "", t.synopsis ?? "", peopleText(t), ""),
    // re-ingest is idempotent: drop this title's credits and rebuild from the fresh fetch
    env.DB.prepare(`DELETE FROM credits WHERE title_id = ?1`).bind(t.id),
  ];

  for (const c of t.credits) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO people (id, tmdb_id, name, known_for_department)
         VALUES (?1,?2,?3,?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      ).bind(c.person.id, c.person.tmdbId, c.person.name, c.person.knownForDepartment),
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
 */
export async function writeTags(
  env: Env,
  titleId: string,
  input: { classification: ClassificationResult; seedInclusionTypes: string[] },
): Promise<void> {
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
  for (const t of input.classification.themes) {
    const id = tagId("theme", t.theme);
    if (id) statements.push(upsert(id, t.confidence, "model", "= 'model'"));
  }

  if (statements.length) await env.DB.batch(statements);
}

export async function writeBlurb(env: Env, titleId: string, blurb: BlurbGroundingResult): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO blurbs (title_id, text, sources, model, approved)
     VALUES (?1, ?2, ?3, ?4, 0)
     ON CONFLICT(title_id) DO UPDATE SET text=excluded.text, sources=excluded.sources, model=excluded.model, approved=0`,
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
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ingest_jobs (id, title_ref, stage, status, error, updated_at)
     VALUES (?1,?2,?3,?4,?5, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       stage=excluded.stage, status=excluded.status, error=excluded.error, updated_at=datetime('now')`,
  )
    .bind(id, ref, stage, status, errorMessage)
    .run();
}
