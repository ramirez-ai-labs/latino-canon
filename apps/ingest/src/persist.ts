import type { ClassificationResult, Title } from "@latino-canon/core";
import type { BlurbGroundingResult } from "./ai.js";
import { EMBEDDING_MODEL } from "@latino-canon/core";
import type { Env } from "./bindings.js";
import { embedText } from "./ai.js";

/** Upsert the row + rebuild its FTS entry. TODO: also upsert people + credits. */
export async function persistTitle(env: Env, t: Title): Promise<void> {
  await env.DB.batch([
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
  ]);
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

export async function writeTags(
  env: Env,
  titleId: string,
  input: { classification: ClassificationResult; seedInclusionTypes: string[] },
): Promise<void> {
  // TODO: resolve tag slugs → tag ids, insert into title_tags with source:
  //   seed slugs → source='seed' confidence=1.0
  //   model inclusion/themes → source='model' with their confidence
  //   (editor overrides are written by the review UI, never here)
  void env;
  void titleId;
  void input;
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
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ingest_jobs (id, title_ref, stage, status, updated_at)
     VALUES (?1,?2,?3,?4, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, status=excluded.status, updated_at=datetime('now')`,
  )
    .bind(id, ref, stage, status)
    .run();
}
