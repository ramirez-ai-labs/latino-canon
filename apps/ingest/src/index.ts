import type { Env, IngestParams } from "./bindings.js";
import { retryErroredJobs, refreshPopularity } from "./maintenance.js";

export { IngestWorkflow } from "./workflow.js";

export default {
  /**
   * Admin surface — protected by INGEST_ADMIN_TOKEN. Not public.
   *   POST /ingest        { titles: IngestParams[] }   → kicks off one workflow per title
   *   GET  /jobs                                       → review queue
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
        const id = st.ref.replace(/\W+/g, "-").toLowerCase();
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

    if (req.method === "GET" && url.pathname === "/jobs") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM ingest_jobs WHERE status IN ('needs_review','error') ORDER BY updated_at DESC LIMIT 200",
      ).all();
      return Response.json({ jobs: results });
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
