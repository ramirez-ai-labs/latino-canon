import type { Env } from "../bindings.js";

/**
 * Remove orphaned database records for 13 invalid TMDB entries.
 * These titles had non-existent/404 TMDB IDs and were removed from seed.json.
 *
 * Execution order respects FK constraints:
 * 1. ingest_jobs (no dependencies)
 * 2. blurbs (FK: title_id → titles.id)
 * 3. title_tags (FK: title_id → titles.id)
 * 4. credits (FK: title_id → titles.id)
 * 5. people (cascade: orphaned after credits deletion)
 * 6. titles (cleaned last)
 */
export async function removeInvalidTmdbEntries(env: Env): Promise<{
  deleted: Record<string, number>;
  verified: Record<string, number>;
}> {
  const titleSlugs = [
    "the-offended-2016",
    "ultimos-dias-en-la-habana-2016",
    "el-amparo-2016",
    "the-movie-of-my-life-2017",
    "a-wolf-at-the-door-2013",
    "the-thin-yellow-line-2015",
    "the-boy-and-the-world-2013",
    "the-golden-dream-2013",
    "the-liberator-2013",
    "the-delay-2012",
    "tattoo-2013",
    "elite-squad-2-the-enemy-within-2010",
    "love-for-sale-2006",
  ];

  const titleRefs = [
    "The Offended (2016)",
    "Últimos días en La Habana (2016)",
    "El Amparo (2016)",
    "The Movie of My Life (2017)",
    "A Wolf at the Door (2013)",
    "The Thin Yellow Line (2015)",
    "The Boy and the World (2013)",
    "The Golden Dream (2013)",
    "The Liberator (2013)",
    "The Delay (2012)",
    "Tattoo (2013)",
    "Elite Squad 2: The Enemy Within (2010)",
    "Love for Sale (2006)",
  ];

  const deleted: Record<string, number> = {};
  const verified: Record<string, number> = {};

  // 1. Delete ingest_jobs
  const jobsResult = await env.DB.prepare(
    `DELETE FROM ingest_jobs WHERE title_ref IN (${titleRefs.map(() => "?").join(", ")})`
  )
    .bind(...titleRefs)
    .run();
  deleted.ingest_jobs = jobsResult.meta.changes;

  // 2. Delete blurbs
  const blurbsResult = await env.DB.prepare(
    `DELETE FROM blurbs WHERE title_id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .run();
  deleted.blurbs = blurbsResult.meta.changes;

  // 3. Delete title_tags
  const tagsResult = await env.DB.prepare(
    `DELETE FROM title_tags WHERE title_id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .run();
  deleted.title_tags = tagsResult.meta.changes;

  // 4. Delete credits
  const creditsResult = await env.DB.prepare(
    `DELETE FROM credits WHERE title_id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .run();
  deleted.credits = creditsResult.meta.changes;

  // 5. Delete orphaned people (those with no remaining credits)
  const orphanedPeopleResult = await env.DB.prepare(
    `DELETE FROM people WHERE id IN (
       SELECT DISTINCT p.id FROM people p
       LEFT JOIN credits c ON p.id = c.person_id
       WHERE c.person_id IS NULL
     )`
  ).run();
  deleted.people = orphanedPeopleResult.meta.changes;

  // 6. Delete titles
  const titlesResult = await env.DB.prepare(
    `DELETE FROM titles WHERE id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .run();
  deleted.titles = titlesResult.meta.changes;

  // Verification: confirm all records deleted
  const verifyIngestJobs = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM ingest_jobs WHERE title_ref IN (${titleRefs.map(() => "?").join(", ")})`
  )
    .bind(...titleRefs)
    .first<{ count: number }>();
  verified.ingest_jobs = verifyIngestJobs?.count ?? 0;

  const verifyTitles = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM titles WHERE id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .first<{ count: number }>();
  verified.titles = verifyTitles?.count ?? 0;

  const verifyTags = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM title_tags WHERE title_id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .first<{ count: number }>();
  verified.title_tags = verifyTags?.count ?? 0;

  const verifyBlurbs = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM blurbs WHERE title_id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .first<{ count: number }>();
  verified.blurbs = verifyBlurbs?.count ?? 0;

  const verifyCredits = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM credits WHERE title_id IN (${titleSlugs.map(() => "?").join(", ")})`
  )
    .bind(...titleSlugs)
    .first<{ count: number }>();
  verified.credits = verifyCredits?.count ?? 0;

  return { deleted, verified };
}
