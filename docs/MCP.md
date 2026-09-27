# Latino Canon MCP server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI assistant search
the canon, read a title's sourced "why it matters" note, find similar titles and ask the curation agent,
all from inside a chat. It works in any MCP client: claude.ai, Claude Desktop, Claude Code, ChatGPT
connectors, Cursor.

```
https://latino-canon-mcp.ai-builders-studio-latinx.workers.dev/mcp
```

Streamable HTTP, stateless, no authentication.

## Connect it

**claude.ai / Claude Desktop** (a paid plan; custom connectors are under Settings → Connectors):
**Add → Add custom connector**, name it `Latino Canon`, paste the URL above, leave authentication off.
In a chat, enable it from the tools menu and ask something like *"Find me Latino films like Coco, and tell me
why each one matters."*

**Claude Code:**

```bash
claude mcp add --transport http latino-canon https://latino-canon-mcp.ai-builders-studio-latinx.workers.dev/mcp
```

**MCP Inspector** (call each tool by hand, no assistant needed):

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP, URL: the address above
```

## Tools

All four are read-only (`readOnlyHint: true`). Each declares an **output schema** and returns typed
`structuredContent` (MCP structured output), plus the same JSON as text for older clients. The SDK validates
every result against its schema. Every title carries a `url` to its page on the site.

| Tool | Arguments | What it does | Backed by |
|---|---|---|---|
| `search_titles` | `query`; optional `kind`, `decade`, `country`, `theme`, `genre`, `inclusionType`, `limit` (1–10) | Hybrid keyword + semantic search: titles, half-remembered plots, people, Spanish | `GET /search?mode=hybrid` |
| `get_title` | `id` | Full record: synopsis, credits, why it's in the canon and on whose authority (seed, editor or classifier with its confidence), and the approved "why it matters" note with its sources | `GET /titles/:id` |
| `similar_titles` | `id`, `limit` (1–12) | Nearest titles by story, setting and themes | `GET /titles/:id/similar` |
| `curate` | `query`, `limit` (1–10) | The curation agent: picks with the reason each matched, plus its reasoning steps | `POST /agents/curate` |

The server also sends **instructions** on connect: what the canon is, how "Latino-focused" is defined (the
six inclusion types), when to use which tool, and to cite the `url` and state only what the results give.

## Design

```
MCP client (claude.ai, Claude Code, ChatGPT…)   <- brings its own model
      │  Streamable HTTP  POST /mcp
      ▼
apps/mcp  (Worker, @modelcontextprotocol/sdk)   <- lists and runs tools; no LLM calls
      │  service binding
      ▼
apps/api  (/search, /titles, /similar, /agents/curate)
```

- **No model, no key.** The client brings the model and pays for it. This Worker only runs tools, so the
  project stays free-tier with no closed-model dependency.
- **Stateless.** Every tool is one read against the api, so there's no session to keep. Each request gets a
  fresh server and transport, and no Durable Object is needed.
- **Authless.** The tools expose exactly what the public api already serves. OAuth would matter for private
  or write tools, and there are none.
- **Same protection as the site.** The api's cache, per-client rate limits and canon visibility gate apply to
  MCP callers unchanged. The Worker forwards the caller's address as `x-client-ip`, as `apps/web` does. For a
  hosted client like claude.ai that address is the client's egress, so its users share one rate-limit
  bucket: the limit protects the neuron budget, not per-user fairness.
- **Only approved notes.** `get_title` leaves out a blurb that neither an editor nor the groundedness judge
  has approved, the same rule the site follows.
- **DNS-rebinding protection.** The spec requires servers to guard against DNS rebinding. `/mcp` only
  answers requests addressed to its own host (`ALLOWED_HOSTS` in `wrangler.jsonc`), which a rebound request
  never is. The host comes from the request URL rather than a `Host` header, which the fetch spec forbids
  and runtimes expose inconsistently. `Origin` is intentionally not allowlisted: the data is public (CORS
  `*`), and a hosted client like claude.ai may send an Origin of its own.
- **Workers-safe validation.** The SDK's default JSON Schema validator (Ajv) compiles schemas with
  `new Function`, which Workers forbid. The server uses the SDK's `CfWorkerJsonSchemaValidator`.

## Cost

| Tool | Workers AI neurons |
|---|---|
| `get_title`, `similar_titles` | 0 |
| `search_titles` | A cache hit costs nothing. A miss costs the query rewrite + embedding, the same as a site search |
| `curate` | The agent's one tone-scoring call, same as on the site. It also has its own daily cap |

## Operating it

- **Deploys:** `.github/workflows/deploy-mcp.yml` on changes to `apps/mcp/**` or `packages/core/**`. After
  deploying it acts as a client against the live URL: `initialize`, `tools/list` (all four tools, each with
  an output schema), then real calls to `get_title("coco-2017")` and `similar_titles`. Both cost no neurons,
  and it checks their structured results. A failure means a connected assistant would fail too.
- **Logs:** each tool call logs `{"event":"mcp.tool","tool":…,"outcome":"ok"|"error","ms":…}` to Workers
  Logs (`latino-canon-mcp` → Observability).
- **Tests:** `pnpm --filter @latino-canon/mcp test` connects the SDK's own `Client` to the server over an
  in-memory transport, with a fake api behind it, and also drives `POST /mcp` over HTTP.
