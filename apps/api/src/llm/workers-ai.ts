import { coerceLlmText, MODELS, type LlmCallOptions, type LlmClient, type LlmResult } from "@latino-canon/core";

/**
 * Workers AI via the native binding, routed through AI Gateway for logging + caching.
 * The gateway is attached per-call with the `gateway` option (no code change to swap it off).
 */
export class WorkersAiClient implements LlmClient {
  readonly provider = "workers-ai" as const;

  constructor(
    private ai: Ai,
    private gatewayId: string,
  ) {}

  async call(opts: LlmCallOptions): Promise<LlmResult> {
    const model = MODELS[opts.task];
    const res = (await this.ai.run(
      model as Parameters<Ai["run"]>[0],
      {
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 512,
        temperature: opts.temperature ?? 0,
        // `opts.json` used to set response_format: { type: "json_schema" } with no
        // `json_schema` field - always malformed, per Workers AI's own vLLM-backed
        // validation ("the 'json_schema' field must be provided"). The deprecated
        // llama-3.1-8b-instruct silently ignored the malformed hint; its "-fast"
        // replacement's stricter backend rejects the whole request with a 400
        // instead (found live, 2026-09-21, right after fixing the deprecation - see
        // docs/operations/monitoring.md). Every caller already enforces its own JSON
        // contract via the prompt's own "Respond ONLY with JSON matching: {...}"
        // instruction plus extractJson()'s fence/brace extraction and zod validation -
        // that's the real guarantee here, not this parameter, which was never actually
        // doing anything even before it started erroring.
      } as Parameters<Ai["run"]>[1],
      {
        gateway: {
          id: this.gatewayId,
          // dedupe identical prompts (e.g. same NL query) for the TTL
          skipCache: false,
          cacheTtl: opts.task === "query-rewrite" ? 3600 : 0,
          metadata: opts.caller ? { task: opts.task, caller: opts.caller } : { task: opts.task },
        },
      },
    )) as { response?: unknown };

    return {
      text: coerceLlmText(res.response),
      model,
      provider: this.provider,
      cached: false, // gateway cache status is available via response headers on REST, not the binding
    };
  }
}
