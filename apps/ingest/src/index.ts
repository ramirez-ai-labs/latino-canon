import type { Env, IngestParams } from "./bindings.js";
import { retryErroredJobs, refreshPopularity } from "./maintenance.js";
import { fetchTmdbPersonGender } from "./sources/tmdb.js";
import { slugId } from "./normalize.js";

export { IngestWorkflow } from "./workflow.js";

export default {
  /**
   * Admin surface — protected by INGEST_ADMIN_TOKEN. Not public.
   *   POST /ingest          { titles: IngestParams[] }   → kicks off one workflow per title
   *   GET  /jobs                                         → review queue
   *   POST /backfill-gender { limit?: number }           → TMDB-only, no Workers AI neurons
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.headers.get("authorization") !== `Bearer ${env.INGEST_ADMIN_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }

    if (req.method === "POST" && url.pathname === "/ingest") {
      const { titles } = (await req.json()) as { titles: IngestParams[] };
      const created = await Promise.all(
        titles.map((t) => env.INGEST_WORKFLOW.create({ params: t })),
      );
      return Response.json({ started: created.map((i) => i.id) });
    }

    if (req.method === "POST" && url.pathname === "/seed-load") {
      interface SeedTitle {
        ref: string;
        title: string;
        year: number;
        kind: "film" | "series";
        seedInclusionTypes?: string[];
      }
      const { titles } = (await req.json()) as { titles: SeedTitle[] };
      const inserted: string[] = [];
      const skipped: string[] = [];

      for (const st of titles) {
        // Must match normalizeTitle()'s id (slugId(details.title, releaseYear)) in
        // workflow.ts, or a later full ingest can't recognize this row as the same
        // title and inserts a duplicate instead of skipping it.
        const id = slugId(st.title, st.year);
        const exists = await env.DB.prepare("SELECT id FROM titles WHERE id = ?").bind(id).first();
        if (exists) {
          skipped.push(st.ref);
          continue;
        }
        await env.DB.prepare(
          `INSERT INTO titles (id, kind, title, original_title, year_start, year_end, countries, languages, popularity)
           VALUES (?, ?, ?, ?, ?, NULL, '[]', '[]', 0)`,
        )
          .bind(id, st.kind, st.title, st.title, st.year)
          .run();

        if (st.seedInclusionTypes && st.seedInclusionTypes.length > 0) {
          const tagBindings = await env.DB.prepare("SELECT id, slug FROM tags").all();
          const tags = tagBindings.results as Array<{ id: string; slug: string }>;
          for (const inclusionType of st.seedInclusionTypes) {
            const tag = tags.find((t) => t.slug === inclusionType);
            if (tag) {
              await env.DB.prepare(
                "INSERT INTO title_tags (title_id, tag_id, confidence, source) VALUES (?, ?, 1.0, 'seed')",
              )
                .bind(id, tag.id)
                .run();
            }
          }
        }
        inserted.push(st.ref);
      }

      return Response.json({ inserted: inserted.length, skipped: skipped.length, details: { inserted, skipped } });
    }

    if (req.method === "POST" && url.pathname === "/backfill-gender") {
      const { limit } = (await req.json().catch(() => ({}))) as { limit?: number };
      const { results: people } = await env.DB.prepare(
        "SELECT id, tmdb_id FROM people WHERE tmdb_id IS NOT NULL AND gender IS NULL LIMIT ?",
      )
        .bind(limit ?? 50)
        .all<{ id: string; tmdb_id: number }>();

      let updated = 0;
      const errors: string[] = [];
      for (const p of people) {
        try {
          const gender = await fetchTmdbPersonGender(env, p.tmdb_id);
          if (gender) {
            await env.DB.prepare("UPDATE people SET gender = ? WHERE id = ?").bind(gender, p.id).run();
            updated++;
          }
        } catch (err) {
          errors.push(`${p.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return Response.json({ checked: people.length, updated, stillUnknown: people.length - updated - errors.length, errors });
    }

    if (req.method === "GET" && url.pathname === "/jobs") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM ingest_jobs WHERE status IN ('needs_review','error') ORDER BY updated_at DESC LIMIT 200",
      ).all();
      return Response.json({ jobs: results });
    }

    if (req.method === "POST" && url.pathname === "/approve-jobs") {
      const { jobIds } = (await req.json()) as { jobIds: string[] };
      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return new Response("jobIds must be a non-empty array", { status: 400 });
      }
      const placeholders = jobIds.map(() => "?").join(",");
      const stmt = env.DB.prepare(
        `UPDATE ingest_jobs SET status = 'done', updated_at = datetime('now') WHERE id IN (${placeholders}) AND status = 'needs_review'`,
      ).bind(...jobIds);
      const result = await stmt.run();
      return Response.json({
        approved: result.meta.changes,
        message: `${result.meta.changes} job(s) approved`,
      });
    }

    return new Response("not found", { status: 404 });
  },

  /** Nightly cron. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      Promise.all([retryErroredJobs(env), refreshPopularity(env)]).then(() => undefined),
    );
  },
};
