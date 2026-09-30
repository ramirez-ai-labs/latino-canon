# Agentic curation v2: a model that chooses its tools

**Status:** proposed (2026-09-30). Nothing here changes the live site; the build follows in the PRs
listed under "Plan", each merged separately, with v2 behind a flag until its eval passes.

## Why

The curation agent (`POST /agents/curate`, also the MCP server's `curate` tool) is a fixed 4-step
pipeline: regex and an 8B query rewrite extract filters, one hybrid search runs, an 8B call scores tone,
and a hand-weighted re-rank orders the results. No model sees the results or decides what to do next.

That breaks on exactly the asks `curate` exists for: a recommendation with several constraints. Three
live requests on 2026-09-30 (v1.7.0):

| Request | What v1 did |
|---|---|
| "female directed documentaries" | The director constraint was never extracted (`directorGender=any`), so it was never applied. One of the five picks isn't a documentary. |
| "a family movie about immigration my kids could watch" | The audience was dropped: none of the five picks is in the Family genre, and content advisory was never checked. |
| "Colombian films from the 2010s made by women" | The country was dropped. Three of the five picks aren't from the 2010s, and one is a series. |

The director constraint comes from a regex (`DIRECTOR_GENDER_RE`, `packages/core/src/query-signals.ts`)
that matches "female director", "directed by women" and "made by women" but not "female directed" - or
"by a Latina director", **the example in the `curate` tool's own description**. Every new phrasing is
another regex branch.

Each failure is a constraint the catalog can check - `directorGender`, `genres`, `contentAdvisory`,
`countries`, `yearStart`, `kind` are all on every card - that a fixed extraction step missed and nothing
downstream could recover. A model that reads the request, calls search with the filters it needs,
**reads the results**, and searches again when they don't fit can fix all three.

## Goals and non-goals

**Goals**
- A model chooses among the canon's read-only tools, sees their results, and decides when it's done.
- Every pick is a title a tool returned during that request (no invented titles), and every "matched"
  label on a pick is computed from catalog metadata, not taken from the model.
- A measurable improvement over v1 on hard constraints, from an eval that can fail, before v2 becomes
  the default.
- Bounded cost: a daily cap on v2 requests, with v1 serving everything past it.

**Non-goals**
- Personalization, memory across requests, or accounts (ROADMAP: "Deliberately deferred").
- Any tool that writes. The agent gets the same read-only surface the public MCP server exposes.
- Replacing `/search`. Plain lookups stay on the cheaper hybrid search.

## Design

### The loop

```
request ──▶ model (tools: search_titles, get_title, similar_titles, recommend)
              │  tool call ──▶ run it (api-internal, no HTTP) ──▶ compact result ──▶ back to the model
              │  ... up to 3 tool rounds ...
              └─ recommend({ picks: [{ id, reason }] }) ──▶ validate ──▶ response
```

- **Tools are the MCP server's, shared, not copied.** `search_titles`, `get_title` and `similar_titles`
  keep their names, descriptions and input schemas, moved from `apps/mcp/src/server.ts` into
  `packages/core` so the MCP server and the agent import one definition. That's the embedding-contract
  lesson (CLAUDE.md #6, incident 4) applied to tools, and it means the MCP tool-selection eval
  (95% on the 70B, 82% on its hard cases) measures the exact surface the agent sees. `curate` is left
  out: the agent calling itself is a loop, not a tool.
- **`recommend` ends the loop.** A tool whose input schema is the final answer (`picks: [{ id, reason }]`,
  1-10) gives a structured, schema-checked output instead of parsing prose.
- **Tools run in-process.** `search_titles` calls `runSearch` with the model's filters as **explicit**
  filters and no query rewrite: the model already chose them, and a rewrite underneath would pay for a
  second LLM call and could re-add guessed filters (the #215 failure). `get_title` and `similar_titles`
  call the same D1/Vectorize code their routes use.
- **Results are compact.** Each card goes back as one line - id, title, year, kind, countries,
  director and `directorGender`, genres, themes, `contentAdvisory`, a short synopsis - because input
  tokens are most of the cost (below) and the model needs the metadata, not the page.

### Validation (what the server enforces, not the model)

- **Grounded picks:** an id no tool returned in this request is dropped and logged
  (`{"event":"agents.curate","outcome":"ungrounded_pick"}`). The eval requires zero.
- **Visibility:** picks pass the same canon visibility gate as `/titles/:id`.
- **Matched criteria are computed:** each pick's `matched` list comes from comparing its metadata with
  the filters the model used, so a label like "director: female" is true by construction. The model's
  `reason` is shown as the agent's words, labeled as such.

### Limits and fallback ("degrade, don't fail", CLAUDE.md #8)

- At most **4 model calls** (3 tool rounds plus `recommend`), `max_tokens` 256 each, temperature 0.
- v1 answers instead, flagged `agentVersion: "v1"` with the reason in the trail, when: the model call
  fails (including neurons running out), the step limit is reached without `recommend`, `recommend`
  fails its schema or keeps no grounded pick, or the v2 daily cap is spent.

### Cost

An estimate to be replaced by the measured number in the build PR. Each model call re-sends the
system prompt, the tool list (~900 tokens) and every earlier result:

| | Tokens in (3 calls) | Tokens out | Neurons per request |
|---|---|---|---|
| Llama 3.3 70B | ~4.5k | ~300 | **~180** (4.5k × 26,668/M + 300 × 204,805/M) |
| Llama 4 Scout | ~4.5k | ~300 | ~135 (24,545 / 77,273 per M) |

v1 costs a few neurons (two 8B calls, the rewrite often cached), which is why it can have a cap of 200
requests a day. At 180 neurons, 200 v2 requests would be 36k - several times the account's 10k. So:

- **v2 daily cap: 10 uncached requests (~1.8k)**, counted in KV like v1's cap. Request 11 onward gets v1.
- A cached response costs nothing, as today (same cache key and TTL).
- Worst planned day: queue 3.2k + blurb regeneration 2k + live search 0.7k + v2 1.8k = 7.7k, with
  ~2.3k headroom.

**Model: Llama 3.3 70B** to start - the one the tool-selection eval has scored. Llama 4 Scout is ~25%
cheaper; if its tool-selection run (pending) comes in close, switching is one line and a re-run of the
curation eval.

### Security

- **Prompt injection through tool results.** Synopses come from TMDB, which anyone can edit, so a result
  can contain instructions. The blast radius is bounded by design: every tool is read-only, the model
  holds no secrets and can reach nothing the public api doesn't already serve, and the worst outcome - a
  bad pick - still has to be a grounded, visible canon title. Tool results go back as tool messages,
  never merged into the system prompt.
- **Cost abuse.** The existing per-IP limit (10/min) and the new v2 cap bound spend; past the cap, v1.
- **No new routes, no admin surface** (CLAUDE.md #9). Same endpoint, same request shape.

### API compatibility

Same endpoint, same request, and every existing response field stays. Added:

- `agentVersion: "v2" | "v1"`, and `fallbackReason` when v2 handed off to v1.
- `steps: [{ tool, args, resultCount, ms }]`, the tool calls in order. `reasoning` keeps its role as the
  human-readable trail (one line per step), so the web page and the MCP `curate` output keep working.

Additive only, so this ships as a minor version.

## How it's measured: an eval that can fail

### The curation eval (new, deterministic)

`packages/eval/src/datasets/curation.jsonl`: 10 requests, each with **hard constraints the catalog can
check** - director gender, kind, decade, country, genre, content advisory - including the three above.
Tone ("uplifting", "something to cry to") isn't checkable from metadata, so no request is scored on it.

| Metric | What it catches |
|---|---|
| **Constraint precision@5** (headline) | Share of picks meeting every hard constraint of their request |
| Per-constraint satisfaction | Which constraint type fails (country? audience?) |
| **Ungrounded picks** | Titles no tool returned - must be 0 |
| Picks returned | Returning fewer than 5 is right when the catalog has fewer; precision doesn't punish it |
| Neurons and latency per request | Measured cost, against the estimate above |

No LLM judge: every check is a metadata comparison, so a score can't drift with a judge's mood (the
groundedness judge's lesson). Ten requests × 5 picks is 50 pick-level checks. A v2 run is ~1.8k neurons,
the day's one optional 70B job; a v1 run is a few neurons and can run any day.

### Ship gate (flip the default to v2 only when all hold)

1. Constraint precision@5: **≥ 0.80, and at least 0.20 above v1** on the same set.
2. **Zero** ungrounded picks.
3. Mean cost ≤ 250 neurons per request; p95 latency ≤ 15 s.
4. The MCP tool-selection eval on the agent's model stays ≥ 90% (it measures the same tool descriptions).

v2 is measured on a non-live version (`wrangler versions upload` with `CURATE_AGENT=v2`), the same way
ranking changes are (CLAUDE.md, "Conventions"), and compared with v1's live run.

## Plan

| PR | What | AI cost |
|---|---|---|
| 1 | This design | none |
| 2 | Shared tool contract: MCP tool names, descriptions and schemas move to `packages/core`; the MCP server imports them. No wording change, so no tool-selection re-run. | none |
| 3 | Curation eval: dataset, deterministic scorer, workflow; **v1 baseline run** | a few neurons |
| 4 | v2 behind `CURATE_AGENT` (default `v1`): `LlmClient` gains tool calling (through AI Gateway), the loop, validation, fallback, the v2 cap; tests on a fake model (grounding, step limit, fallback, cap) | none (tests) |
| 5 | Measure v2 on a preview version; if the gate passes, flip the default, show `steps` on the site, update the budget table (README, `monitoring.md`), release | ~1.8k (one eval run) |

## Decisions needed

1. **v2 daily cap:** 10 uncached requests (~1.8k neurons) is proposed. Higher needs a quieter planned day.
2. **Model:** start on the 70B, revisit after the Scout tool-selection run.
3. **Ship gate thresholds:** precision ≥ 0.80 and +0.20 over v1 are proposed; lower would ship a smaller
   improvement, higher may need more than 3 tool rounds (and more neurons).
