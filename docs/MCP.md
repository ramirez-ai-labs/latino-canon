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
| `search_titles` | `query` (optional when a filter says it all, e.g. `decade: 1970`); optional `kind`, `decade`, `country`, `theme`, `genre`, `inclusionType`, `limit` (1–10) | Hybrid keyword + semantic search: titles, half-remembered plots, people, Spanish | `GET /search?mode=hybrid` |
| `get_title` | `id` | Full record: synopsis, credits, why it's in the canon and on whose authority (seed, editor or classifier with its confidence), and the approved "why it matters" note with its sources | `GET /titles/:id` |
| `similar_titles` | `id`, `limit` (1–12) | Nearest titles by story, setting and themes | `GET /titles/:id/similar` |
| `curate` | `query`, `limit` (1–10) | The curation agent: picks with the reason each matched, plus its reasoning steps | `POST /agents/curate` |

The server also sends **instructions** on connect: what the canon is, how "Latino-focused" is defined (the
six inclusion types), when to use which tool, to cite the `url` and state only what the results give, and to
answer anything outside the canon (general knowledge, math, translation) without calling a tool.

Whole-number arguments (`decade`, `limit`) also accept their digits as text (`"6"`): open models often send
numbers that way, and on the first tool-selection run it was the most common failure. Anything else still fails.

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
  fresh server and transport, and no Durable Object is needed. With nothing to push, `GET /mcp` (the
  optional server-to-client stream) and `DELETE /mcp` (ending a session) answer **405**, as the spec
  requires; clients carry on over POST. Before this, `GET` opened a silent stream that never closed, and
  `claude mcp add` failed with `InvalidHTTPResponse`.
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

## Evaluation: does a model pick the right tool?

The server calls no model, so its tool names, descriptions, schemas and connect-time instructions are all an
assistant has to go on. That wording is tested like code: `packages/eval/src/run-mcp-tools.ts` connects to the
live server as a client, reads `initialize` and `tools/list`, and gives exactly those to Llama 3.3 70B
(Workers AI function calling, temperature 0) with each of 41 requests in `datasets/mcp-tools.jsonl`.

| Group | Example | Expected |
|---|---|---|
| Look something up | "What has Gael García Bernal been in?" | `search_titles`, the person's own words, **no filters** |
| Search with a filter | "horror movies from Argentina" | `search_titles` with `genre: Horror`, `country: AR` |
| Open a result | "Tell me more about the second one" (after a listed search) | `get_title` with that id |
| More like this | "More like Coco, please" | `similar_titles` with `coco-2017` |
| Recommend | "Something uplifting by a Latina director" | `curate` |
| Off-topic | "What's the capital of Peru?" | no tool |
| Hard (11 of the 41) | "Films set in 1940s Los Angeles, around the zoot suit riots" | `search_titles`, and **not** `decade: 1940` - *Zoot Suit* is set then but came out in 1981 |

The first run (2026-09-29) scored 30/30 on the original 30 requests, which meant the set couldn't tell a good
description from a worse one. The 11 hard requests (2026-09-30) are the places a model reading the tools loosely
goes wrong: a story's setting taken as its release decade, "Mexican-American" taken as `country: MX`, a
multi-step ask whose id can't be guessed (so it must search first), Spanish follow-ups for every tool, a plain
genre lookup sent to `curate`, and off-topic questions that name a canon title. Each has a `note` with why its
answer is the right one.

First run on the 41 (2026-09-30, Llama 3.3 70B): pass 95%, hard requests 82%. Both misses searched for a
question that named a canon title or director but asked for a translation or a pronunciation, so the server's
instructions now say that naming one doesn't make a question about the canon.

A case passes when the tool is right (or rightly none), the arguments pass the tool's input schema (what the
server itself would reject), expected ids and filters match, and a plain lookup adds no search filter.
Filters exclude, so a guessed filter can hide the right answer - the same failure as incident 5 in
`docs/operations/monitoring.md`, one layer out. A hard case can also forbid a value (`forbidArgs`) or accept any
of several (`args.id: [..]`). Scores: pass rate (the headline), tool accuracy, argument accuracy, pass rate per
group, and the hard requests' pass rate on their own. The workflow's `model` input scores another
function-calling model (Llama 4 Scout, Mistral Small 3.1) on the same requests; the Eval page shows the 70B's
latest run and each other model's beside it. A call the model writes into its text reply instead of `tool_calls` still
counts, since a client would run it.

```bash
# Manual: Actions -> "Run MCP tool-selection eval" (records to D1; results on the Eval page)
CF_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... pnpm --filter @latino-canon/eval mcp-tools
CASES=similar-coco,curate-cry-mothers ...   # a subset, to check a fix (not recorded from CI)
MCP_URL=<preview>/mcp ...                    # a non-live server
```

About 1k neurons a run (the tool list rides in every prompt), so it's the day's one extra 70B job. Run it
after changing a tool's wording, and compare with the last run.

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
