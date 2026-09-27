import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ApiClient, type Env } from "./api.js";
import { SERVER_NAME, SERVER_VERSION, buildServer } from "./server.js";

/**
 * Remote MCP server over the Latino Canon api: Streamable HTTP at /mcp, stateless and
 * authless. Stateless because every tool is one read against the api - there's no
 * session state to keep, so no Durable Object, and each request gets a fresh server and
 * transport. Authless because the tools expose exactly what the public api already
 * serves; the api's cache and rate limits are the protection, as they are for the site.
 *
 * The model is the client's: claude.ai, Claude Code, ChatGPT or Cursor brings its own
 * and calls these tools. This Worker makes no LLM calls itself.
 */

// Browser-based clients (the MCP Inspector) need CORS; hosted clients call server-side.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * The MCP spec requires servers to guard against DNS rebinding, where a hostile page gets
 * a browser to send requests to the server under the attacker's own hostname. Checking
 * the host blocks that outright: a rebound request is addressed to the attacker's host.
 * Read from the request URL, not a `Host` header - fetch treats Host as a forbidden header,
 * so runtimes differ on exposing it (Node's Request never does), and the SDK's own check
 * reads the header. The URL is built from the Host the client sent, everywhere.
 *
 * Origin is deliberately not restricted: these tools serve public data to any client
 * (CORS is "*"), and hosted clients such as claude.ai may send an Origin of their own,
 * which an allowlist would silently break.
 */
function hostAllowed(request: Request, env: Env): boolean {
  const allowed = env.ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean);
  return allowed.includes(new URL(request.url).host);
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!hostAllowed(request, env)) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: `Invalid host: ${new URL(request.url).host}` }, id: null },
      { status: 403 },
    );
  }

  const server = buildServer(new ApiClient(env.API, request.headers.get("cf-connecting-ip")), env.WEB_URL);
  // Stateless mode; JSON responses instead of an SSE stream, since no tool streams progress.
  // Host validation happens above (hostAllowed), not via the SDK's header-based option.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") return handleMcp(request, env);
    if (pathname === "/") {
      return Response.json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcp: new URL("/mcp", request.url).toString(),
        transport: "streamable-http",
        auth: "none",
        tools: ["search_titles", "get_title", "similar_titles", "curate"],
        docs: "https://github.com/ramirez-ai-labs/latino-canon/blob/main/docs/MCP.md",
      });
    }
    return new Response("not found", { status: 404 });
  },
};
