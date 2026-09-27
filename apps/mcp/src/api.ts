/** The api worker, reached over the service binding (or a fake in tests). */
export interface ApiFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  API: ApiFetcher;
  WEB_URL: string;
  /** Comma-separated Host headers /mcp accepts. */
  ALLOWED_HOSTS: string;
}

/** A non-2xx api response; tools turn the status into a message the model can act on. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`api ${status} for ${path}`);
    this.name = "ApiError";
  }
}

/**
 * Calls the public api on behalf of one MCP request. The api rate-limits per caller by
 * `cf-connecting-ip`, which a service-binding request doesn't carry - so, like apps/web,
 * this forwards the caller's address as `x-client-ip` (apps/api rate-limit.ts reads it
 * only when `cf-connecting-ip` is absent, which a public caller can't arrange). For a
 * hosted client like claude.ai that address is the client's egress, not the end user's,
 * so its users share one bucket: the limit protects the neuron budget, not fairness.
 */
export class ApiClient {
  constructor(
    private readonly api: ApiFetcher,
    private readonly clientIp: string | null,
  ) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  private async request<T>(path: string, init: { method: string; body?: string }): Promise<T> {
    const res = await this.api.fetch(
      new Request(`https://api${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(this.clientIp ? { "x-client-ip": this.clientIp } : {}),
        },
      }),
    );
    if (!res.ok) throw new ApiError(res.status, path);
    return (await res.json()) as T;
  }
}
