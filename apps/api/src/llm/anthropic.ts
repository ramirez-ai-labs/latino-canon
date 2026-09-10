import { MODELS, type LlmCallOptions, type LlmClient, type LlmResult } from "@latino-canon/core";

/**
 * Claude via AI Gateway's Anthropic passthrough. Used only when LLM_PROVIDER=anthropic,
 * i.e. offline blurb generation where quality matters and the run is a one-time cost.
 *
 * Endpoint: https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/anthropic/v1/messages
 */
export class AnthropicClient implements LlmClient {
  readonly provider = "anthropic" as const;

  constructor(
    private apiKey: string,
    private accountId: string,
    private gatewayId: string,
  ) {}

  async call(opts: LlmCallOptions): Promise<LlmResult> {
    const model = MODELS.anthropic[opts.task];
    const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const messages = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const url = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/${this.gatewayId}/anthropic/v1/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "cf-aig-metadata": JSON.stringify({ task: opts.task }),
      },
      body: JSON.stringify({
        model,
        system,
        messages,
        max_tokens: opts.maxTokens ?? 512,
        temperature: opts.temperature ?? 0,
      }),
    });

    if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as { content: { type: string; text: string }[] };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

    return { text, model, provider: this.provider, cached: resp.headers.get("cf-aig-cache-status") === "HIT" };
  }
}
