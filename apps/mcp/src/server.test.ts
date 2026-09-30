import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CANON_TOOLS, type Title, type TitleCard } from "@latino-canon/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, type ApiFetcher } from "./api.js";
import { handleMcp } from "./index.js";
import { buildServer } from "./server.js";
import rootPackage from "../../../package.json";

const WEB = "https://web.test";

const card = (id: string, title: string): TitleCard => ({
  id,
  kind: "film",
  title,
  yearStart: 2017,
  yearEnd: null,
  director: "Lee Unkrich",
  directorGender: "male",
  leadActor: "Anthony Gonzalez",
  leadActorGender: "male",
  posterKey: null,
  blurbTeaser: "A boy enters the Land of the Dead.",
  inclusionTypes: ["about_community"],
  inclusionTypesWithConfidence: [],
  themes: ["family"],
  score: 0.9,
  representationHandling: null,
  runtime: 105,
  oscarWin: null,
  genres: ["Animation"],
  contentAdvisory: "general",
});

const title = (approved: boolean): Title => ({
  id: "coco-2017",
  tmdbId: 354912,
  imdbId: "tt2380307",
  kind: "film",
  title: "Coco",
  originalTitle: "Coco",
  yearStart: 2017,
  yearEnd: null,
  country: ["US"],
  language: ["en"],
  synopsis: "Miguel dreams of becoming a musician.",
  posterKey: null,
  popularity: 50,
  runtime: 105,
  credits: [
    { person: { id: "p1", tmdbId: 1, name: "Lee Unkrich", knownForDepartment: null, gender: "male" }, role: "director", character: null, order: 0 },
    { person: { id: "p2", tmdbId: 2, name: "Anthony Gonzalez", knownForDepartment: null, gender: "male" }, role: "cast", character: "Miguel", order: 0 },
  ],
  tags: [
    { kind: "inclusion_type", slug: "about_community", label: "About the community", confidence: 1, source: "seed" },
    { kind: "theme", slug: "family", label: "Family", confidence: 0.9, source: "model" },
  ],
  blurb: {
    text: "Coco (2017) follows a boy in Mexico [s1]. It won 2 Oscars [a1].",
    sources: [
      { kind: "synopsis", ref: "coco-2017", quote: null, id: "s1", text: "Miguel dreams of becoming a musician." },
      { kind: "award", ref: "tt2380307", quote: null, id: "a1", text: "Coco (2017) awards (OMDb): Won 2 Oscars." },
    ],
    model: "m",
    approved,
  },
  representationHandling: null,
  contextNotes: [],
  oscarWin: null,
  genres: ["Animation"],
  contentAdvisory: "general",
});

/** A fake api worker: routes by path, records every request it receives. */
function fakeApi(routes: Record<string, (req: Request) => Response>) {
  const requests: Request[] = [];
  const api: ApiFetcher = {
    fetch: (req) => {
      requests.push(req);
      const path = new URL(req.url).pathname;
      const handler = routes[path];
      return Promise.resolve(handler ? handler(req) : new Response("not found", { status: 404 }));
    },
  };
  return { api, requests };
}

async function connect(api: ApiFetcher, clientIp: string | null = "203.0.113.7") {
  const server = buildServer(new ApiClient(api, clientIp), WEB);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

const text = (r: unknown) => (r as CallToolResult).content.map((c) => (c.type === "text" ? c.text : "")).join("");
const parsed = (r: unknown) => JSON.parse(text(r)) as Record<string, unknown>;

afterEach(() => vi.restoreAllMocks());

describe("tools/list", () => {
  it("offers the four read-only tools", async () => {
    const client = await connect(fakeApi({}).api);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["curate", "get_title", "search_titles", "similar_titles"]);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("declares an output schema for every tool (structured output)", async () => {
    const { tools } = await (await connect(fakeApi({}).api)).listTools();
    for (const t of tools) expect(t.outputSchema?.type, t.name).toBe("object");
    const getTitle = tools.find((t) => t.name === "get_title")!;
    expect(getTitle.outputSchema?.required).toEqual(expect.arrayContaining(["title", "whyInCanon", "url"]));
  });

  it("sends the canon's instructions on initialize", async () => {
    const client = await connect(fakeApi({}).api);
    expect(client.getInstructions()).toContain("Latino-directed");
  });
});

describe("search_titles", () => {
  it("runs a hybrid search with only the filters given, forwarding the caller's ip", async () => {
    const { api, requests } = fakeApi({
      "/search": () => Response.json({ query: "", mode: "hybrid", interpretation: null, results: [card("coco-2017", "Coco")], tookMs: 1 }),
    });
    const client = await connect(api);
    const res = await client.callTool({ name: "search_titles", arguments: { query: "day of the dead", kind: "film" } });

    const url = new URL(requests[0]!.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "day of the dead", mode: "hybrid", limit: "5", kind: "film" });
    expect(requests[0]!.headers.get("x-client-ip")).toBe("203.0.113.7");

    const body = parsed(res);
    expect(body.results).toEqual([
      expect.objectContaining({ id: "coco-2017", whyInCanon: ["About the community"], url: `${WEB}/title/coco-2017` }),
    ]);
  });

  it("says so when results are keyword-only", async () => {
    const { api } = fakeApi({
      "/search": () => Response.json({ query: "", mode: "hybrid", interpretation: null, results: [], tookMs: 1, degraded: true }),
    });
    const body = parsed(await (await connect(api)).callTool({ name: "search_titles", arguments: { query: "x" } }));
    expect(body.note).toMatch(/keyword-only/i);
  });

  it("turns the api's rate limit into an error the model can act on", async () => {
    const { api } = fakeApi({ "/search": () => new Response("slow down", { status: 429 }) });
    const res = await (await connect(api)).callTool({ name: "search_titles", arguments: { query: "x" } });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/rate limited/i);
  });

  it("rejects an out-of-range limit before calling the api", async () => {
    const { api, requests } = fakeApi({});
    const res = await (await connect(api)).callTool({ name: "search_titles", arguments: { query: "x", limit: 50 } });
    expect(res.isError).toBe(true);
    expect(requests).toEqual([]);
  });

  it("accepts whole numbers sent as text - the 2026-09-29 eval's most common failure - and still rejects garbage", async () => {
    const { api, requests } = fakeApi({
      "/search": () => Response.json({ query: "", mode: "hybrid", interpretation: null, results: [], tookMs: 1 }),
    });
    const client = await connect(api);
    const ok = await client.callTool({ name: "search_titles", arguments: { query: "x", decade: "1970", limit: "3" } });
    expect(ok.isError).toBeFalsy();
    expect(Object.fromEntries(new URL(requests[0]!.url).searchParams)).toMatchObject({ decade: "1970", limit: "3" });

    const bad = await client.callTool({ name: "search_titles", arguments: { query: "x", limit: "three" } });
    expect(bad.isError).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it("browses by filter when a filter says it all and there's no query ('films from the 1970s')", async () => {
    const { api, requests } = fakeApi({
      "/search": () => Response.json({ query: "", mode: "hybrid", interpretation: null, results: [card("canoa-1976", "Canoa")], tookMs: 1 }),
    });
    const body = parsed(await (await connect(api)).callTool({ name: "search_titles", arguments: { decade: 1970, kind: "film" } }));
    const params = Object.fromEntries(new URL(requests[0]!.url).searchParams);
    expect(params).toEqual({ mode: "hybrid", limit: "5", decade: "1970", kind: "film" });
    expect(body).toMatchObject({ query: "", results: [{ id: "canoa-1976" }] });
  });

  it("asks for a query or a filter instead of searching for nothing", async () => {
    const { api, requests } = fakeApi({});
    const res = await (await connect(api)).callTool({ name: "search_titles", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/query, or at least one filter/);
    expect(requests).toEqual([]);
  });
});

describe("the shared tool contract (packages/core/src/tools.ts)", () => {
  // The curation agent gives its model these same definitions, so the tool-selection eval
  // measures what the agent sees only if this server advertises them unchanged.
  it("advertises each tool with the shared title and description", async () => {
    const { tools } = await (await connect(fakeApi({}).api)).listTools();
    for (const [name, def] of Object.entries(CANON_TOOLS)) {
      expect(tools.find((t) => t.name === name), name).toMatchObject({ title: def.title, description: def.description });
    }
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(CANON_TOOLS).sort());
  });
});

describe("server instructions", () => {
  it("tell the model to answer off-topic questions itself - 3 of 8 eval failures called a tool for them", async () => {
    const client = await connect(fakeApi({}).api);
    expect(client.getInstructions()).toMatch(/only cover the canon's films and series/);
    expect(client.getInstructions()).toMatch(/answer directly and don't call a tool/);
  });

  // The 2026-09-30 run (41 cases): both misses searched for a question that named a canon
  // title or director but asked for a translation or a pronunciation.
  it("say that naming a title or person doesn't make a translation or pronunciation question about the canon", async () => {
    const client = await connect(fakeApi({}).api);
    expect(client.getInstructions()).toMatch(/names a title or a\s+person but asks for something these tools don't hold/);
    expect(client.getInstructions()).toMatch(/how to translate a title, how to pronounce a\s+name/);
  });
});

describe("get_title", () => {
  it("returns the record with its approved, sourced note - citations stripped from the text", async () => {
    const { api } = fakeApi({ "/titles/coco-2017": () => Response.json(title(true)) });
    const body = parsed(await (await connect(api)).callTool({ name: "get_title", arguments: { id: "coco-2017" } }));
    expect(body).toMatchObject({
      title: "Coco",
      directors: ["Lee Unkrich"],
      cast: ["Anthony Gonzalez (Miguel)"],
      whyInCanon: [{ type: "About the community", source: "seed" }],
      whyItMatters: { text: "Coco (2017) follows a boy in Mexico. It won 2 Oscars." },
      url: `${WEB}/title/coco-2017`,
    });
  });

  it("returns the same record as structuredContent, validated against its output schema", async () => {
    const { api } = fakeApi({ "/titles/coco-2017": () => Response.json(title(true)) });
    const res = await (await connect(api)).callTool({ name: "get_title", arguments: { id: "coco-2017" } });
    expect(res.structuredContent).toEqual(parsed(res));
    // originalTitle equals the title, so it's omitted - not sent as undefined.
    expect(res.structuredContent).not.toHaveProperty("originalTitle");
  });

  it("leaves out a blurb no editor or judge has approved", async () => {
    const { api } = fakeApi({ "/titles/coco-2017": () => Response.json(title(false)) });
    const body = parsed(await (await connect(api)).callTool({ name: "get_title", arguments: { id: "coco-2017" } }));
    expect(body.whyItMatters).toBeUndefined();
  });

  it("says where ids come from when the id isn't in the canon", async () => {
    const res = await (await connect(fakeApi({}).api)).callTool({ name: "get_title", arguments: { id: "nope-1999" } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("search_titles");
  });
});

describe("similar_titles and curate", () => {
  it("similar_titles passes the limit through", async () => {
    const { api, requests } = fakeApi({
      "/titles/coco-2017/similar": () => Response.json({ titleId: "coco-2017", results: [card("encanto-2021", "Encanto")] }),
    });
    const body = parsed(await (await connect(api)).callTool({ name: "similar_titles", arguments: { id: "coco-2017", limit: 3 } }));
    expect(new URL(requests[0]!.url).search).toBe("?limit=3");
    expect(body).toMatchObject({ like: "coco-2017", results: [{ id: "encanto-2021" }] });
  });

  it('similar_titles runs with limit "6" as text - "More like this" scored 0% on that alone', async () => {
    const { api, requests } = fakeApi({
      "/titles/coco-2017/similar": () => Response.json({ titleId: "coco-2017", results: [] }),
    });
    const res = await (await connect(api)).callTool({ name: "similar_titles", arguments: { id: "coco-2017", limit: "6" } });
    expect(res.isError).toBeFalsy();
    expect(new URL(requests[0]!.url).search).toBe("?limit=6");
  });

  it("curate posts the ask and returns picks with their reasons", async () => {
    const { api, requests } = fakeApi({
      "/agents/curate": () =>
        Response.json({
          userQuery: "q",
          interpretation: "family films",
          topResults: [{ title: card("coco-2017", "Coco"), score: 0.9, matchedCriteria: ["theme: family"], reason: "A family story." }],
          totalMatches: 1,
          reasoning: ["Searched for family films."],
          extractedIntent: { cleanedQuery: "q", source: "rules" },
          cached: false,
        }),
    });
    const body = parsed(await (await connect(api)).callTool({ name: "curate", arguments: { query: "a family movie", limit: 2 } }));
    expect(requests[0]!.method).toBe("POST");
    expect(await requests[0]!.json()).toEqual({ query: "a family movie", limit: 2 });
    expect(body).toMatchObject({ reasoning: ["Searched for family films."], picks: [{ id: "coco-2017", reason: "A family story." }] });
  });
});

describe("POST /mcp over HTTP", () => {
  it("refuses a Host it doesn't serve (DNS-rebinding protection)", async () => {
    const res = await handleMcp(
      new Request("https://attacker.example/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { API: fakeApi({}).api, WEB_URL: WEB, ALLOWED_HOSTS: "mcp.test" },
    );
    expect(res.status).toBe(403);
  });

  it("answers initialize statelessly with JSON, with CORS for browser clients", async () => {
    const res = await handleMcp(
      new Request("https://mcp.test/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
        }),
      }),
      { API: fakeApi({}).api, WEB_URL: WEB, ALLOWED_HOSTS: "mcp.test" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = await res.json<{ result: { serverInfo: { name: string } } }>();
    expect(body.result.serverInfo.name).toBe("latino-canon");
  });

  it("reports the repo's release version, so clients know which release they're on", async () => {
    const res = await handleMcp(
      new Request("https://mcp.test/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "0" } },
        }),
      }),
      { API: fakeApi({}).api, WEB_URL: WEB, ALLOWED_HOSTS: "mcp.test" },
    );
    const body = await res.json<{ result: { serverInfo: { version: string } } }>();
    expect(body.result.serverInfo.version).toBe(rootPackage.version);
    expect(rootPackage.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("answers tools/list on its own request, as the deploy smoke test sends it", async () => {
    const res = await handleMcp(
      new Request("https://mcp.test/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-06-18",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      }),
      { API: fakeApi({}).api, WEB_URL: WEB, ALLOWED_HOSTS: "mcp.test" },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ result: { tools: { name: string }[] } }>();
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(["curate", "get_title", "search_titles", "similar_titles"]);
  });
});

describe("GET and DELETE /mcp", () => {
  it("answers the client's stream request with 405 instead of an empty stream that never closes", async () => {
    // The request Claude Code sends after initialize; a 200 event stream here made it
    // fail with InvalidHTTPResponse (2026-09-27).
    const res = await handleMcp(
      new Request("https://mcp.test/mcp", {
        method: "GET",
        headers: { accept: "text/event-stream", "mcp-protocol-version": "2025-06-18" },
      }),
      { API: fakeApi({}).api, WEB_URL: WEB, ALLOWED_HOSTS: "mcp.test" },
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json<{ error: { code: number } }>();
    expect(body.error.code).toBe(-32000);
  });

  it("answers DELETE with 405: there are no sessions to end", async () => {
    const res = await handleMcp(new Request("https://mcp.test/mcp", { method: "DELETE" }), {
      API: fakeApi({}).api,
      WEB_URL: WEB,
      ALLOWED_HOSTS: "mcp.test",
    });
    expect(res.status).toBe(405);
  });

  it("still refuses a foreign Host before anything else", async () => {
    const res = await handleMcp(new Request("https://attacker.example/mcp", { method: "GET" }), {
      API: fakeApi({}).api,
      WEB_URL: WEB,
      ALLOWED_HOSTS: "mcp.test",
    });
    expect(res.status).toBe(403);
  });
});
