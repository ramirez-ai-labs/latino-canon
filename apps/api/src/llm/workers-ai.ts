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
        ...(opts.json ? { response_format: { type: "json_schema" } } : {}),
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
