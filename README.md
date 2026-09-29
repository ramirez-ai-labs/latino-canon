# Latino Canon

A Spotify-like search experience for Latino-led films and series — curate, index, and
surface Latino-focused cinema and TV with rich context and fast, intuitive search.

This repo is an **AI-engineering reference project**: every AI component runs on
Cloudflare's free tier, is observable, and is evaluated. The stack is deliberately
"standard 2026 edge-AI" so it reads as a portfolio piece for AI platform / forward-deployed
roles.

---

## What this project demonstrates

A production system built end to end: a four-Worker architecture, a retrieval stack gated by
evals on every deploy, and an LLM pipeline whose output is judged before anyone sees it,
running at **$0/month** on a 10,000-neuron daily AI budget. Each claim below links to the code
or PR that shows it, with the number it moved.

### AI engineering

| Skill | Where it shows | Result |
|---|---|---|
| **Hybrid retrieval (RAG)** | BM25 over D1 FTS5 + `bge-m3` embeddings in Vectorize, fused with weighted reciprocal rank fusion ([hybrid.ts](apps/api/src/search/hybrid.ts)) | recall@5 **0.818**, recall@10 **0.905** on a 97-query golden set |
| **LLM query understanding, with guardrails** | The LLM extracts filters only; inferred filters re-rank, explicit ones exclude ([run-search.ts](apps/api/src/search/run-search.ts)); retrieval runs on the user's own words [#215](https://github.com/ramirez-ai-labs/latino-canon/pull/215), [#284](https://github.com/ramirez-ai-labs/latino-canon/pull/284) | recall@5 0.680 → **0.806** after one wrong filter guess stopped excluding answers; genre/era/kind queries **0.564 → 0.764** |
| **Grounded generation with citations** | "Why it matters" notes written only from supplied sources, citing them inline; OMDb awards as a source ([prompts.ts](packages/core/src/prompts.ts), [blurb-sources.ts](packages/core/src/blurb-sources.ts)) | Every note shows the sources behind its claims |
| **LLM-as-judge, versioned** | A 70B groundedness judge frozen at v3; runs from before it saw source text are kept and labeled invalid ([run-groundedness.ts](packages/eval/src/run-groundedness.ts)) | Scores only compare within a judge version; the record is corrected, never deleted |
| **Eval-gated generation** | The same judge gates every new note at ingest, plus a deterministic citation check for what the judge misses ([groundedness.ts](packages/core/src/groundedness.ts)) [#261](https://github.com/ramirez-ai-labs/latino-canon/pull/261)–[#263](https://github.com/ramirez-ai-labs/latino-canon/pull/263) | Daily auto-approval **33% → 87%** after the prompt and citation fixes |
| **Safe regeneration** | Old notes are rewritten, and a rewrite replaces one only if it passes the gate ([blurb-regen.ts](apps/ingest/src/blurb-regen.ts)) [#275](https://github.com/ramirez-ai-labs/latino-canon/pull/275) | A visible note is never swapped for a worse one |
| **MCP server** | A remote, stateless Streamable HTTP server with four read-only tools, typed structured output, and DNS-rebinding protection ([apps/mcp](apps/mcp)) [#267](https://github.com/ramirez-ai-labs/latino-canon/pull/267), [#285](https://github.com/ramirez-ai-labs/latino-canon/pull/285) | Works in Claude Desktop, Claude Code and the MCP Inspector; no model or API key on the server |
| **Tool-use eval for the MCP server** | A model gets only what the live server tells every assistant (instructions + `tools/list`) and must call the right tool with the right arguments, or none; 30 cases, scored on tool, schema-valid arguments, and no filter nobody asked for ([mcp-tools.ts](packages/eval/src/mcp-tools.ts)) | Tool wording is tested like code: a description change is measured before it ships |
| **Agent with a visible reasoning trail** | The curation agent: intent → hybrid search → LLM tone scoring → re-rank ([curation-agent.ts](apps/api/src/agents/curation-agent.ts)) | Every step logged and shown to the user |
| **Bilingual search** | Multilingual embeddings, English/Spanish stopwords in keyword search, a Spanish golden set tagged by failure mode [#274](https://github.com/ramirez-ai-labs/latino-canon/pull/274), [#284](https://github.com/ramirez-ai-labs/latino-canon/pull/284) | Spanish recall@5 measured on 28 queries, not 8 |
| **AI cost engineering** | Cache-first search, per-client rate limits, a keyword fallback when the AI budget runs out, and zero-neuron features by design (`/similar`, MCP reads) [#236](https://github.com/ramirez-ai-labs/latino-canon/pull/236), [#266](https://github.com/ramirez-ai-labs/latino-canon/pull/266) | **$0/month**; every AI call has a measured cost |

### Machine learning

| Skill | Where it shows | Result |
|---|---|---|
| **Embeddings and vector search** | 1024-dim `bge-m3` vectors with filterable metadata, and one shared embedding contract after three copies once drifted ([embedding.ts](packages/core/src/embedding.ts)) | Filtered semantic search restored after a metadata wipe (incident 4) |
| **Zero-shot classification with human review** | A 70B classifier assigns six inclusion types and themes with confidences; low-confidence results go to a review queue; tag precedence is editor > seed > model | The classifier's output is visible, labeled and correctable |
| **Rank fusion tuning** | RRF weights tuned by offline replay against the golden set ([hybrid.ts](apps/api/src/search/hybrid.ts)) | `[2,1]` lexical:semantic lifted recall@5 0.799 → 0.816 with no newly broken queries |
| **Threshold calibration from data** | The semantic score floor (a recall@10 trade-off), the `/similar` floor from live score distributions, and the judge's 1.0 bar from its coarse score steps | Each threshold's reasoning is documented in the code |
| **Model selection by task** | 8B for query rewriting, content advisory and tone; 70B for classification, notes and the judge. The judge moved to 70B when the 8B one flipped scores between identical runs | Cost spent where accuracy matters |

### Data science

| Skill | Where it shows | Result |
|---|---|---|
| **Metric design** | recall@k, precision@k, MRR and nDCG@10, overall and by query type ([metrics.ts](packages/eval/src/metrics.ts)) | Every ranking change ships with before/after numbers |
| **Golden-set curation** | 97 queries with answers checked against the live catalog, grouped by type, the Spanish ones tagged by failure mode; stale answers audited ([queries.jsonl](packages/eval/src/datasets/queries.jsonl)) | Two queries whose ceiling was capped by a deleted film, found and fixed |
| **Experiment design** | Variants measured on non-live preview deployments before merge, with trade-offs published and confounders recorded (catalog size per run) [#284](https://github.com/ramirez-ai-labs/latino-canon/pull/284) | Of three variants, the first scored *worse* (0.780); diagnosing why produced the one that shipped |
| **Error analysis** | Judge failures grouped by pattern; retrieval misses per query and type ([eval-insights.ts](apps/web/src/lib/eval-insights.ts)) | Found that 115 of 131 failing notes shared one unsupported sentence, which pointed the fix at the prompt |
| **Data quality and entity resolution** | TMDB matches checked by year (±2) and title similarity (bigram Dice) [#238](https://github.com/ramirez-ai-labs/latino-canon/pull/238), [#243](https://github.com/ramirez-ai-labs/latino-canon/pull/243); a seed audit [#244](https://github.com/ramirez-ai-labs/latino-canon/pull/244), [#245](https://github.com/ramirez-ai-labs/latino-canon/pull/245) | 28 wrong matches re-pinned, 14 wrong films removed from production |
| **Operationalizing a fuzzy concept** | "Latino-focused" defined as six explicit inclusion types with written criteria and past rulings ([CRITERIA.md](apps/ingest/src/seed/CRITERIA.md)) | A taxonomy people can read, apply and argue with |
| **Data visualization** | The Evals page: trend and stacked-bar charts with colors checked by a colorblind-safety validator, a table view for each chart, and plain-language explanations [#272](https://github.com/ramirez-ai-labs/latino-canon/pull/272), [#282](https://github.com/ramirez-ai-labs/latino-canon/pull/282) | Built for readers new to evals as well as experts |

### Software engineering and architecture

| Skill | Where it shows | Result |
|---|---|---|
| **Service architecture** | Four Cloudflare Workers (web, api, ingest, mcp) joined by private service bindings, with shared types, schemas and prompts in `packages/core` | Each deploys independently; one contract across all four |
| **Durable pipelines** | Ingest as a Cloudflare Workflow with retried, idempotent steps, fed by a daily queue ([workflow.ts](apps/ingest/src/workflow.ts), [ingest-queue.ts](apps/ingest/src/ingest-queue.ts)) [#249](https://github.com/ramirez-ai-labs/latino-canon/pull/249) | Ingest volume fixed at 15 titles a day, however many PRs merge |
| **Resilience** | A keyword fallback when embeddings fail, a cache keyed by deployed version, degraded results never cached | Search keeps working when the AI budget runs out |
| **Security** | Admin operations only on the ingest worker behind a token, with a test that fails if an admin route returns to the public API; per-client rate limits; MCP host validation | An unauthenticated admin route that shipped twice now can't ship again |
| **Testing** | Worker tests against real local D1/KV/R2, fakes for Workers AI and Vectorize, a red-then-green regression test for each incident | ~330 tests across api, ingest, mcp, core and eval |
| **API design** | A typed REST API with an OpenAPI spec and Swagger UI, zod validation, and structured MCP tool schemas | [Public API docs](https://latino-canon-api.ai-builders-studio-latinx.workers.dev/docs) |
| **Frontend and design systems** | Next.js 15 on Workers; the Cartelera identity with runtime light/dark tokens chosen from three documented directions ([IDENTITY_DIRECTIONS.md](docs/design/IDENTITY_DIRECTIONS.md)) [#276](https://github.com/ramirez-ai-labs/latino-canon/pull/276) | WCAG AA contrast in both themes |

### DevOps and platform engineering

| Skill | Where it shows | Result |
|---|---|---|
| **CI** | Every PR: lint with warning caps, typecheck, tests, the web build, seed validation, and a dependency audit ([validate-pr.yml](.github/workflows/validate-pr.yml)) | A merge that silently dropped seven titles is now caught in CI |
| **CD with verification** | Path-scoped deploys; migrations applied first, and the ingest deploy waits for them; every deploy checks itself live: a retrieval eval gate, an MCP client smoke test, a web smoke test [#264](https://github.com/ramirez-ai-labs/latino-canon/pull/264), [#281](https://github.com/ramirez-ai-labs/latino-canon/pull/281) | Each deploy proves it works, not just that it built |
| **Evaluate before merge** | Ranking changes measured on a non-live Worker version (`wrangler versions upload`) against the live baseline [#284](https://github.com/ramirez-ai-labs/latino-canon/pull/284) | Regressions found before users see them |
| **Release management** | Semver releases with written highlights; the version shown in the product and reported by the MCP server | v1.0.0 → v1.6.0 |
| **Observability and incident response** | Structured JSON logs, AI Gateway, a daily blurb-gate chart, and a runbook built from eight real incidents ([monitoring.md](docs/operations/monitoring.md)) | Every incident has a cause, a fix and a guard |
| **Cost management (FinOps)** | Measured cost per AI job, and a daily budget rule for the account-wide limit | $0/month runtime with 294 titles live |
| **Supply chain** | A weekly `pnpm audit` in CI with targeted overrides ([security-audit.yml](.github/workflows/security-audit.yml)) | 4 advisories (2 high) cleared, now watched |

---

## Why this stack

| Concern | Choice | Why it's the right default (and free-tier safe) |
|---|---|---|
| Compute | **Cloudflare Workers** | 100k req/day free. One runtime for app, API, and pipelines — no cold-start tax, no separate Python host. |
| Frontend | **Next.js 15 (App Router) on Workers via [OpenNext](https://opennext.js.org/cloudflare)**, React 19, Tailwind 4 | Server components for SEO on title pages; Cloudflare's currently-recommended Next path (not `next-on-pages`). UI primitives are CVA + lucide icons, no component-library dependency. |
| API | **Hono on Workers** | Tiny, typed, fast router. Kept as its own worker so "AI services" is a real boundary — independently deployable and observable. `web` calls it over a **service binding** (no public round-trip). |
| Relational data | **D1 (SQLite)** | 500 MB / 5M row-reads per day free. Holds titles, people, credits, tags, blurbs, collections. |
| Lexical search | **D1 FTS5** | BM25 full-text ranking built into D1 — no separate Meilisearch/Elastic host to pay for. |
| Semantic search | **Vectorize** | Managed vector DB, free tier covers this corpus size. `bge-m3` embeddings (1024-dim, **multilingual** — EN + ES synopses). |
| Hybrid ranking | **Reciprocal Rank Fusion in the Worker** | Combine BM25 + cosine lists deterministically. No reranker service. |
| LLM inference | **Workers AI** | Runtime path (query rewriting) and offline path (classification, blurb generation) both run on Workers AI (10k neurons/day free) — no closed-model provider, deployed app costs $0. |
| LLM observability | **AI Gateway** | Free. Caching, logging, and per-request metadata in front of Workers AI. |
| Async pipelines | **Workflows + Cron Triggers** | Queues require Workers Paid — Workflows are free-tier eligible and give durable, retriable multi-step ingestion. |
| Object storage | **R2** | 10 GB free, zero egress. Ingest caches posters there and the api serves them from `/posters`, so we don't hot-link TMDB. |
| Cache | **KV** | Search and curation-agent result caches (checked before any AI call), plus the agent's per-client and daily call counters. |
| Abuse / cost control | **Rate Limiting binding** | 30 requests/min per client on `/search`, in front of every AI call. No KV writes per request (the free tier allows 1,000/day). |
| Agent | **Curation agent (`/agents/curate`)** | A fixed 4-step pipeline - extract intent, one hybrid search, score a small pool by tone (the one LLM step), re-rank - with a visible reasoning trail. |
| Agent access | **Remote MCP server (`apps/mcp`)** | Four read-only tools (search, get title, similar, curate) any MCP client can call - claude.ai, Claude Code, ChatGPT, Cursor. Stateless and authless; the client brings the model, so no API key and no closed-model dependency. |
| Eval | **`packages/eval`** | Recall@k / MRR / nDCG@10 for retrieval; LLM-as-judge groundedness for blurbs. Runs in CI; the retrieval eval gates every api deploy. |
| Tooling | **pnpm 10 + Turborepo, TypeScript 5.9, Vitest** | Workers suites run on real local D1/KV/R2 via `@cloudflare/vitest-pool-workers`. Node ≥ 22. |

**Everything above is Cloudflare free tier, with no paid or closed-model dependency.**

---

## Architecture

```
                        ┌─────────────────────────────────────────────┐
   Browser ──────────►  │  apps/web   Next.js 15 / OpenNext (Workers) │
                        │  - landing / browse / search / title pages  │
                        └───────────────┬─────────────────────────────┘
   MCP clients ──► apps/mcp (Workers) ──┤ service binding (env.API)
                        ┌───────────────▼─────────────────────────────┐
                        │  apps/api   Hono (Workers)                  │
                        │  GET /search   hybrid | lexical | semantic  │
                        │    cache → rate limit → exact-title pin →   │
                        │    rewrite → BM25 + vector → RRF            │
                        │  POST /agents/curate   (curation agent)     │
                        │  GET /titles/:id   GET /collections/:slug   │
                        │  GET /posters   GET /eval-runs   GET /docs  │
                        │  POST /feedback                             │
                        └──┬─────────┬──────────┬─────────┬───────────┘
                           │         │          │         │
                     ┌─────▼──┐ ┌────▼────┐ ┌───▼───┐ ┌───▼────────┐
                     │  D1    │ │Vectorize│ │  KV   │ │ Workers AI │
                     │ +FTS5  │ │ bge-m3  │ │ cache │ │  / AI GW   │
                     └────────┘ └─────────┘ └───────┘ └────────────┘
                                  R2 (posters) · Rate Limiting binding
                           ▲
                           │ writes
                ┌──────────┴───────────────────────────────────────┐
                │  apps/ingest   Workflow + Cron (Workers)         │
                │  cron 08:00 UTC: daily queue, 15 seed entries    │
                │  resolve (TMDB) → fetch (TMDB/OMDb) → normalize  │
                │  → D1 → classify (inclusion_type + themes)       │
                │  → embed → Vectorize → blurb                     │
                │  → human-review queue (ingest_jobs)              │
                │  admin endpoints behind INGEST_ADMIN_TOKEN       │
                └──────────────────────────────────────────────────┘

   packages/core   types · zod schemas · taxonomy · RRF · prompts · LLM provider
   packages/eval   retrieval metrics · groundedness judge · golden query set
```

### Use it from an AI assistant (MCP)

The canon is also a remote MCP server, so Claude, ChatGPT or Cursor can search it and quote its sourced
notes inside a conversation:

```
https://latino-canon-mcp.ai-builders-studio-latinx.workers.dev/mcp
```

In claude.ai: Settings → Connectors → **Add custom connector**, paste the URL, no authentication. In Claude
Code: `claude mcp add --transport http latino-canon <url>`. Tools, design and costs are in
[docs/MCP.md](docs/MCP.md).

---

## The core modeling problem

"Latino-focused" is not a genre tag — it needs an explicit, defensible operationalization.
`packages/core/src/taxonomy.ts` defines it:

| `inclusion_type` | Meaning | Example |
|---|---|---|
| `led_by` | Latino director / showrunner in creative control | *Real Women Have Curves* (Patricia Cardoso) |
| `created_by` | Latino writer(s) / creator(s) of the work | *One Day at a Time* (Gloria Calderón Kellett) |
| `about_community` | Centers Latino characters / experience regardless of authorship | *Coco* |
| `breakthrough` | A "first" — representation, award, box office milestone | *Selena* |
| `starring` | A Latino actor holds the lead or title role | *No Manches Frida* (Martha Higareda) |
| `produced_by` | A Latino producer held significant creative or executive control | *Suárez* (Wilmer Valderrama) |

The full policy, with edge cases and past rulings, is `apps/ingest/src/seed/CRITERIA.md`.
Every title carries ≥1 `inclusion_type` tag plus theme tags. The classifier produces
these with a confidence score (`source = 'model'`); an editor can override
(`source = 'editor'`); seed titles are trusted (`source = 'seed'`). The UI shows the tag
on the card — it's the visible output of the model.

---

## Repo layout

```
apps/
  web/        Next.js 15 + OpenNext  → Workers
  api/        Hono API + search + AI services  → Workers
  ingest/     Workflow + Cron ingestion pipeline  → Workers
  mcp/        Remote MCP server: search, titles, similar, curate  → Workers
packages/
  core/       shared types, zod schemas, taxonomy, RRF, prompts, LLM provider abstraction
  eval/       retrieval + groundedness evaluation harness
infra/
  README.md   resource creation commands (D1, Vectorize, KV, R2, AI Gateway)
scripts/      infra-create.ts (creates the resources, writes ids into wrangler.jsonc)
docs/         API and ingest references, ROADMAP, operations/monitoring runbook
.github/workflows/   PR validation, per-worker deploys, evals, release
```

---

## Getting started

```bash
pnpm install
cp apps/ingest/.dev.vars.example apps/ingest/.dev.vars   # fill TMDB_API_KEY, OMDB_API_KEY
cp apps/api/.dev.vars.example apps/api/.dev.vars         # optional: local development overrides
cp apps/web/.dev.vars.example apps/web/.dev.vars         # optional: local development overrides
```

`TMDB_API_KEY` (free, [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)) and
`OMDB_API_KEY` (free tier, [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx)) are
only used by `apps/ingest` — the resolve/fetch step of the Workflow. `wrangler dev` loads
`.dev.vars` automatically; for a deployed worker, set the same keys with
`wrangler secret put TMDB_API_KEY` (see [infra/README.md](infra/README.md)) instead —
`.dev.vars` is gitignored and never used in production.

Create the Cloudflare resources (see [infra/README.md](infra/README.md)):

```bash
pnpm infra:create        # d1 + vectorize + kv + r2 + ai-gateway, writes ids into wrangler.jsonc
pnpm --filter api db:migrate:local
pnpm --filter ingest seed        # loads apps/ingest/src/seed/canon.seed.json through the Workflow
```

Run everything locally:

```bash
pnpm dev                 # web :3000, api :8787, ingest :8788 (wrangler dev --remote for Workers AI)
```

Evaluate:

```bash
pnpm eval:retrieval      # Recall@k / MRR / nDCG@10 vs packages/eval/src/datasets/queries.jsonl,
                         # overall and per query type (known-item, person, plot, facet, spanish).
                         # Needs a running api with real data. MODES=hybrid runs one mode.
pnpm eval:groundedness   # 70B LLM judge checks each blurb's claims against its sources
                         # (needs CF_ACCOUNT_ID, CLOUDFLARE_API_TOKEN; ~2.8k neurons per run)
```

In CI, `.github/workflows/eval-retrieval.yml` runs the retrieval eval against the live api
after every api deploy (hybrid) and weekly (all modes), records it to `eval_runs`, and fails
when hybrid recall@5 drops more than 0.03 against the last passing run on the same golden
set. Each run records the catalog size. When a drop comes from new titles rather than a code
change - the ingest queue grows the catalog daily - re-run it from **Actions** with the
`rebaseline` input and a reason; that run becomes the new baseline, with the reason recorded. Groundedness runs are triggered by hand (`eval-groundedness.yml`), since each costs
about a quarter of the daily Workers AI allocation. Both histories are on the site's Eval page.

A narrower, CI-enforced version of the retrieval eval runs on every PR with zero setup:
`apps/api/src/search/lexical.eval.test.ts` seeds a small hand-authored fixture into a
local D1 instance and asserts recall@5 / MRR against it using the same
`packages/eval` metrics functions. It only proves the BM25 path (tokenizer, FTS query,
ranking) hasn't regressed — not retrieval quality against the real corpus, which needs
`pnpm eval:retrieval` against a deployed worker with real data.

Deploy:

```bash
pnpm --filter api deploy
pnpm --filter ingest deploy
pnpm --filter web deploy
pnpm --filter mcp deploy
```

All changes should go through a branch and pull request targeting `main`.
`.github/workflows/validate-pr.yml` runs the web build, typechecks every workspace
package, lints all code via ESLint (with environment-specific rule strictness), and runs
their test suites on every pull request — including a fixture-backed BM25 retrieval
regression test (`apps/api/src/search/lexical.eval.test.ts`) that exercises the real
`lexicalSearch` → `titles_fts` path and the same `packages/eval` metrics (recall@k, MRR)
used by `pnpm eval:retrieval`, entirely locally via `@cloudflare/vitest-pool-workers` —
no Cloudflare account or deployed data needed. Protect `main` in GitHub and require this
workflow to pass before merging.

After a pull request is merged, `.github/workflows/deploy-web.yml`,
`deploy-api.yml`, `deploy-ingest.yml` and `deploy-mcp.yml` each deploy their Worker from
Ubuntu — each is scoped by `paths:` to its own `apps/<name>/**`, so only the Worker(s)
whose code actually changed redeploy; a change under `packages/core/**` (shared by all
four) redeploys all of them. `deploy-ingest.yml` waits for the same commit's api deploy
when the push adds a migration, and `deploy-mcp.yml` smoke-tests the live MCP server
(initialize, tools/list, two zero-neuron tool calls). `security-audit.yml` audits
production dependencies weekly and on lockfile PRs. `deploy-api.yml` also applies any pending D1
migrations (`wrangler d1 migrations apply --remote`, idempotent — already-applied
ones are skipped) before deploying, so a migration added under
`apps/api/migrations/` takes effect automatically on merge rather than needing a
manual follow-up step. That step runs with `continue-on-error` — a migration
failure still shows up as a failed job (so it doesn't go unnoticed), but can no
longer block the Worker from deploying, the way it did the first time this ran.
A successful api deploy then triggers the retrieval eval above, as a post-deploy
regression check (it can't block the deploy that triggered it). Each workflow can also
be started manually from **Actions**. Add these repository secrets in GitHub:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

`CLOUDFLARE_API_TOKEN` needs, at minimum: **Workers Scripts:Edit**, **D1:Edit**,
**Workers KV Storage:Edit**, **Workers R2 Storage:Edit**, and **Account
Settings:Read** — Cloudflare's built-in "Edit Cloudflare Workers" token template
covers the first and last by default but not D1; add D1:Edit explicitly, or the
migration step above will fail with a `7403` even though deploys still succeed
(exactly what happened when this was first set up).

Then merge a passing pull request, or run **Deploy web Worker** / **Deploy api
Worker** / **Deploy ingest Worker** manually.

Pull requests are labeled automatically by changed area and conventional title
prefix. Releases are created manually from **Actions -> Release** using the next
semantic version (current: `1.6.0`); the workflow creates a tag like
`latino-canon-v1.6.0`, generates release notes from merged PRs since the last tag,
and supports prereleases.

Adding a title to the canon is a normal PR: edit
`apps/ingest/src/seed/canon.seed.json` — see
[`apps/ingest/src/seed/CRITERIA.md`](apps/ingest/src/seed/CRITERIA.md) for the
inclusion-type verification checklist first — open a PR, get it reviewed. Merging
doesn't ingest anything by itself: the ingest worker's daily cron (08:00 UTC) runs an
**ingest queue** (`apps/ingest/src/ingest-queue.ts`) that takes the next
`INGEST_QUEUE_PER_DAY` (15) pinned seed entries not yet live and starts their
Workflows, so ingest volume stays inside the neuron budget however many content PRs
merge in a day. A re-pinned entry counts as not live, so corrections drain the same way.
`GET /queue` on the ingest worker shows what's next and anything held (an entry whose
current pin already failed, which needs a human). `ingest-new-titles.yml` remains as a
manual override for ingesting new entries immediately.

---

## Free-tier budget (rough, verify against current docs)

| Resource | Free/day | This project's expected load |
|---|---|---|
| Workers requests | 100,000 | search + page views |
| Workers AI neurons | 10,000 | live search ~0.5–0.7k/day; ingest queue ~3k/day; evals below (measured 2026-09-24/25) |
| D1 rows read | 5,000,000 | search + detail pages |
| D1 rows written | 100,000 | ingestion + feedback |
| Vectorize queried dims | 30M/mo | 1024 dims × topK 20 × queries |
| KV reads | 100,000 | cache hits |

Runtime cost target: **$0**, including ingestion — no paid or closed-model dependency
anywhere in the stack.

### The Workers AI neuron budget is account-wide, and ingestion can blow it

This actually happened: growing the catalog from 16 to ~85 titles in one session (plus a
~60-title `force:true` re-ingest run to recover from an unrelated incident) burned
**11.18k of the account's 10k daily neuron cap** on `classify`/`blurb` alone — both run
on `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, the most expensive model this project
uses, twice per title. That one pipeline was ~98% of the day's entire usage.

Two things worth being deliberate about going forward:

1. **The cap is per Cloudflare *account*, not per Worker or per project.** If other
   Workers projects share this account (they do here — this account also runs
   unrelated projects with their own Workers AI usage), their usage counts against
   the same daily 10,000-neuron ceiling. `apps/ingest/scripts/lib/post-titles.ts`'s
   `BATCH = 4` with a 5s delay keeps any *single* ingest run from spiking neuron
   usage all at once, but it doesn't prevent the *cumulative* total across many
   batches in one day from crossing the account-wide cap — nothing currently tracks
   that running total.
2. **Exhausting the cap doesn't just stall ingestion — it breaks live search.**
   `apps/api`'s hybrid/semantic search and query-rewrite both call Workers AI on
   every request. Once the account hits the cap, `GET /search` starts erroring for
   real users until the daily reset at **00:00 UTC**, not just new titles failing to
   classify.

Measured costs (2026-09-24, Workers AI analytics, `aiInferenceAdaptiveGroups`):

| Job | Model | Neurons |
|---|---|---|
| Live search (query rewrite + embedding) | 8B + bge-m3 | ~0.5–0.7k/day |
| Ingest classify + blurb + judge (daily queue, 15 titles) | 70B | ~3.2k/day (~200 per title + ~13 for the judge) |
| Groundedness eval, 212 blurbs | 70B | ~2.8k per run |
| Retrieval eval, 97 queries | 8B + bge-m3 | ~0.15k hybrid / ~0.4k all modes |
| MCP tool-selection eval, 30 cases | 70B | ~1k per run (estimated from tokens; each run prints its own) |

Rules this project follows: besides the daily ingest queue, at most one 70B job
(blurb regeneration, a sampled judge run) per day, capped at ~2k, so the planned day stays
near 6k; a full groundedness run (~2.8k) waits for a day with no queue run; validate on a
sample before full runs; schedules are weekly, not nightly, unless a deploy triggers them.

Practical guidance: when growing the catalog by more than a handful of titles, spread
large batches across more than one day rather than running them all at once, and treat
"is there other Workers AI activity in this account today" as a real input before
running a big batch — not just this project's own ingest volume. If the catalog's
growth pace outgrows the free tier long-term, Workers AI's paid plan removes the daily
cap; that's a deliberate cost decision to make explicitly, not something to back into
by accident.

---

## Evaluation results

*(Last refreshed 2026-09-27, against the live catalog of 294 titles. Both evals now run
from CI and record to `eval_runs`; the live history is on the site's Eval page.)*

### Retrieval

`pnpm eval:retrieval` runs the golden query set (`packages/eval/src/datasets/queries.jsonl`,
97 queries) against the deployed `api` worker, after every api deploy (hybrid mode) and
weekly (all modes). A run fails when hybrid recall@5 drops more than 0.03 against the last
passing run on the same golden set. Current baseline, hybrid, by query type:

| query type | n | recall@5 | MRR |
|---|---|---|---|
| known-item (exact titles, typos, aliases) | 7 | 1.000 | 1.000 |
| person (director/actor named) | 10 | 0.800 | 0.694 |
| plot (half-remembered descriptions) | 44 | 0.799 | 0.752 |
| facet (genre, kind, decade asks) | 8 | 0.764 | 0.781 |
| spanish (original titles, native plots, people) | 28 | 0.825 | 0.687 |
| **all** | 97 | **0.818** | 0.748 |

The Spanish set grew from 8 queries, mostly translations of English plot queries (0.453),
to 28 that include original Spanish titles, native Spanish plot descriptions and people
([#274](https://github.com/ramirez-ai-labs/latino-canon/pull/274)). Every original-title and
person query passes. Search now runs on the user's own words as well as the LLM rewrite's
condensed keywords, and keyword search drops English and Spanish stopwords
([#284](https://github.com/ramirez-ai-labs/latino-canon/pull/284)): the rewrite had been
dropping the words that found the answer ("telenovela parody series" lost *Jane the Virgin*),
and genre, era and kind queries rose from 0.564 to 0.764. The change was measured on a non-live
version before merge; the one trade-off is Spanish rank quality (MRR 0.732 -> 0.687). Plot
descriptions (0.799) are now the weakest type, and the inferred-genre boost is the next fix on
the [roadmap](docs/ROADMAP.md). Exact titles now always rank first: a query that names a
title pins it to the top ([#258](https://github.com/ramirez-ai-labs/latino-canon/pull/258)),
which took known-item MRR from 0.833 to 1.000.

How the number got here is part of the story. Hybrid recall@5 was 0.889 on the original
16-title catalog and 15 queries; the same queries against the 219-title catalog drop to
0.744, because there's now real room for a plausible-but-wrong title to outrank the true
match. Tuning RRF weights to `[2, 1]` (favor lexical) brought the 62-query set to 0.832.
Adding genre inference then silently dropped it to 0.680: the query rewrite routinely
guessed 4-5 filters and each was enforced as a hard requirement, so one wrong guess
(genre=Music for *In the Heights*, tagged Drama/Romance) excluded the answer before
ranking ran. Making inferred filters a ranking boost instead restored 0.806
([#215](https://github.com/ramirez-ai-labs/latino-canon/pull/215)) - and that regression,
found by hand, is why the eval now runs on every deploy.

### Groundedness

`pnpm eval:groundedness` has an LLM judge (70B) check each approved blurb's claims against
the sources it was written from. **Current baseline: 0.682** (211 of 212 blurbs scored,
judge v3). About 120 of the ~140 flagged blurbs fail on a single "It matters…" sentence
that no source supports. New blurbs are written without it (sourced facts only, with
OMDb's awards line as a source), and ingest now runs the same v3 judge on each one:
a blurb with every claim supported is approved automatically (`approved_by = 'judge'`),
anything less waits for an editor. The eval and the gate share one judge input format
(`packages/core/src/groundedness.ts`), so a gate verdict and an eval score measure the
same thing.

Earlier published numbers (0.486 and similar) were invalid: until
[#216](https://github.com/ramirez-ai-labs/latino-canon/pull/216) the judge was given each
source's reference (a title slug, a director's name) instead of its text, so it never saw
the synopsis it was checking against. Those runs are kept, labeled invalid, on the Eval
page. Scores are only comparable within the same judge version.

Getting any groundedness number at all first required fixing a separate bug: a
`writeBlurb` upsert reset every blurb's approval on *any* re-ingest of its title, so the
live site was showing zero editorial blurbs. Approval now only resets when the blurb's text
or sources actually change.

## Status

**v1.6.0.** v1.5.0 gave the project its own look (the Cartelera identity, paper and ink by
default with a dark mode on a toggle) and a sharper view of its quality. v1.6.0 makes search
and its checks stronger: retrieval on the user's own words with English/Spanish stopwords
(genre, era and kind searches 0.564 → 0.764 recall@5, measured on a non-live version before
merge), a daily record of the blurb gate (auto-approval 33% → 87% after the prompt and
citation fixes), a live smoke test after every web deploy, an Evals page that explains its
metrics in plain language, and an MCP server that connects cleanly from Claude Code and
Claude Desktop (see the
[release notes](https://github.com/ramirez-ai-labs/latino-canon/releases/tag/latino-canon-v1.6.0)). See [docs/ROADMAP.md](docs/ROADMAP.md) for the design philosophy behind
what's built vs. what's next, and a prioritized backlog. See [docs/operations/monitoring.md](docs/operations/monitoring.md)
for how to operate this in production — resource names, AI Gateway/neuron-budget checks, and an
incident response runbook built around six real production incidents. See [docs/FEATURES_COMPLETED.md](docs/FEATURES_COMPLETED.md)
for a summary of all shipped features.

The ingest resolve → fetch → normalize → persist → classify → embed → blurb path
is implemented and has been run end-to-end against live TMDB/OMDb and a deployed
Workflow — 264 titles are live in production D1/Vectorize (ingested, classified,
embedded, blurbed), not just covered by fixture tests. The seed holds 331 after the Latin
American cinema expansion; the daily queue ingests the rest at 15 a day.

`GET /titles/:id` hydrates the full `Title` (metadata + credits + tags + approved
blurb, with each source's cited id and text) from D1 rather than returning a raw row, and poster images are served from R2
via a dedicated `/posters` route (`apps/api/src/routes/titles.ts`,
`apps/api/src/routes/posters.ts`).

Other open scaffold items: `semantic.ts`'s minimum score floor (`MIN_SEMANTIC_SCORE
= 0.35`) is still a hand-picked heuristic — tested at 0.45 against the 62-query
golden set and deliberately kept at 0.35 (a real recall@5-vs-recall@10 trade-off,
not a clean win). `/titles/:id/similar` queries Vectorize by the title's own stored
vector (no model call) and powers "More like this" on title pages. Classify and blurb calls live in `apps/ingest/src/ai.ts`, calling
Workers AI directly; the api's `LlmClient` abstraction serves the runtime calls (query
rewrite, the curation agent's tone scoring).

The nightly cron's retry/refresh logic (`apps/ingest/src/maintenance.ts`) is now
implemented for real: `retryErroredJobs` replays the exact `IngestParams` stored on
the job row at creation time (never guesses them from `title_ref`, which is
exactly what corrupted an unrelated title once — see
[monitoring.md](docs/operations/monitoring.md#2-stuck-ingest-jobs-behind-a-retry-mechanism-that-doesnt-retry)),
and `refreshPopularity` re-fetches TMDB popularity for titles stale by 30+ days.

---

## Documentation

**Interactive API Explorers** (live Swagger UI):
- 🚀 [Public API Swagger UI](https://latino-canon-api.ai-builders-studio-latinx.workers.dev/docs) — Search films, get details, browse collections
- 🔐 [Admin Ingest API Swagger UI](https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/docs) — Authenticate with token, trigger ingestion

**Reference:**
- [docs/API.md](docs/API.md) — OpenAPI 3.0 spec, client generation, rate limits
- [docs/INGEST_API.md](docs/INGEST_API.md) — Admin API reference with all endpoints
- [docs/ROADMAP.md](docs/ROADMAP.md) — design philosophy, backlog, ongoing work
- [apps/ingest/src/seed/CRITERIA.md](apps/ingest/src/seed/CRITERIA.md) — Latino-focused inclusion rules (the actual policy)
- [docs/INGEST.md](docs/INGEST.md) — detailed ingest pipeline walkthrough
- [docs/ADULT_CONTENT_POLICY.md](docs/ADULT_CONTENT_POLICY.md) — content moderation policy
- [.github/WORKFLOWS.md](.github/WORKFLOWS.md) — GitHub Actions organization and trigger conditions
- [infra/README.md](infra/README.md) — resource creation, secrets, deployment

**Archived development logs:**
For detailed Phase documentation, see [docs/archive/phases/](docs/archive/phases/). These documents track the evolution and specific decisions made during development but are not needed for ongoing work.
