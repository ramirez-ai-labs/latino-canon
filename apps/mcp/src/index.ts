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

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const server = buildServer(new ApiClient(env.API, request.headers.get("cf-connecting-ip")), env.WEB_URL);
  // sessionIdGenerator undefined = stateless mode; JSON responses instead of an SSE
  // stream, since no tool streams progress.
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
