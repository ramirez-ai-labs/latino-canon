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
