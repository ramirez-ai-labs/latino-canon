import type { CurationRequest, CurationResponse, ToolCallingClient } from "@latino-canon/core";
import type { Env } from "../bindings.js";
import { makeToolClient } from "../llm/index.js";
import { runAgentV2, type AgentOutcome, type AgentTools } from "./curation-agent-v2.js";
import { makeAgentTools } from "./v2-tools.js";

/** `recommend` takes at most 10 picks; v1 allows 20, but a v2 answer stops at 10. */
const MAX_V2_LIMIT = 10;

/**
 * POST /agents/curate with CURATE_AGENT=v2. Any failure - the model call throwing (including
 * neurons running out), the step limit, an invalid or ungrounded `recommend` - hands the
 * request to v1 with the reason in `fallbackReason` and v2's trail kept in `reasoning`:
 * degrade, don't fail (CLAUDE.md #8).
 */
export async function curateV2(
  env: Env,
  request: CurationRequest,
  v1: () => Promise<CurationResponse>,
  deps: { model?: ToolCallingClient; tools?: AgentTools } = {},
): Promise<CurationResponse> {
  const limit = Math.min(Math.max(request.limit ?? 5, 1), MAX_V2_LIMIT);
  const started = Date.now();
  let outcome: AgentOutcome;
  try {
    outcome = await runAgentV2(request.query, limit, deps.model ?? makeToolClient(env), deps.tools ?? makeAgentTools(env));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outcome = { ok: false, reason: `model_error: ${message.slice(0, 200)}`, steps: [], reasoning: [], usage: { modelCalls: 0, inputTokens: 0, outputTokens: 0, neurons: null } };
  }
  const ms = Date.now() - started;
  console.warn(
    JSON.stringify({
      event: "agents.curate",
      agent: "v2",
      outcome: outcome.ok ? "completed" : "fallback",
      ...(outcome.ok ? {} : { reason: outcome.reason }),
      query: request.query,
      toolCalls: outcome.steps.length,
      ...outcome.usage,
      ms,
    }),
  );

  if (!outcome.ok) {
    const r = await v1();
    return {
      ...r,
      agentVersion: "v1",
      fallbackReason: outcome.reason,
      steps: outcome.steps,
      reasoning: [...outcome.reasoning.map((l) => `v2: ${l}`), `v2 handed the request to v1 (${outcome.reason})`, ...r.reasoning],
    };
  }
  return {
    userQuery: request.query,
    interpretation: outcome.searches.length ? `Searched: ${outcome.searches.join("; ")}` : "No search filters used",
    topResults: outcome.picks,
    totalMatches: outcome.seen,
    reasoning: outcome.reasoning,
    extractedIntent: { cleanedQuery: request.query, source: "none" },
    cached: false,
    agentVersion: "v2",
    steps: outcome.steps,
  };
}
