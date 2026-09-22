import { Hono } from "hono";
import type { Env } from "../bindings.js";
import { curate } from "../agents/curation-agent.js";
import type { CurationRequest } from "../agents/types.js";

export const agentsRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /agents/curate
 * Curation agent: interprets natural language → runs multi-mode search → synthesizes results
 *
 * Request body: { query: string, limit?: number, explainReasoning?: boolean }
 * Response: { userQuery, interpretation, topResults, reasoning, extractedIntent }
 */
agentsRoute.post("/curate", async (c) => {
  const body = await c.req.json<CurationRequest>();

  if (!body.query) {
    return c.json({ error: "Missing 'query' field" }, 400);
  }

  try {
    const response = await curate(c.env, body);
    return c.json(response);
  } catch (err) {
    return c.json(
      {
        error: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
      },
      500,
    );
  }
});

/**
 * GET /agents/health
 * Health check for agent service
 */
agentsRoute.get("/health", async (c) => {
  return c.json({
    service: "latino-canon-agents",
    status: "ok",
    agents: ["curation"],
  });
});
