# Latino Canon

A Spotify-like search experience for Latino-led films and series — curate, index, and
surface Latino-focused cinema and TV with rich context and fast, intuitive search.

This repo is an **AI-engineering reference project**: every AI component runs on
Cloudflare's free tier, is observable, and is evaluated. The stack is deliberately
"standard 2026 edge-AI" so it reads as a portfolio piece for AI platform / forward-deployed
roles.

---

## Why this stack

| Concern | Choice | Why it's the right default (and free-tier safe) |
|---|---|---|
| Compute | **Cloudflare Workers** | 100k req/day free. One runtime for app, API, and pipelines — no cold-start tax, no separate Python host. |
| Frontend | **Next.js 15 (App Router) on Workers via [OpenNext](https://opennext.js.org/cloudflare)** | Server components for SEO on title pages; Cloudflare's currently-recommended Next path (not `next-on-pages`). |
| API | **Hono on Workers** | Tiny, typed, fast router. Kept as its own worker so "AI services" is a real boundary — independently deployable and observable. `web` calls it over a **service binding** (no public round-trip). |
| Relational data | **D1 (SQLite)** | 500 MB / 5M row-reads per day free. Holds titles, people, credits, tags, blurbs, collections. |
| Lexical search | **D1 FTS5** | BM25 full-text ranking built into D1 — no separate Meilisearch/Elastic host to pay for. |
| Semantic search | **Vectorize** | Managed vector DB, free tier covers this corpus size. `bge-m3` embeddings (1024-dim, **multilingual** — EN + ES synopses). |
| Hybrid ranking | **Reciprocal Rank Fusion in the Worker** | Combine BM25 + cosine lists deterministically. No reranker service. |
| LLM inference | **Workers AI** (default) → **Claude via AI Gateway** (opt-in) | Runtime path (query rewriting, classification) uses Workers AI (10k neurons/day free) so the deployed app costs $0. Offline path (blurb generation) can switch to `claude-haiku-4-5` / `claude-sonnet-5` by env var. |
| LLM observability | **AI Gateway** | Free. Caching, logging, per-request metadata, and provider fallback in front of *both* Workers AI and Anthropic. |
| Async pipelines | **Workflows + Cron Triggers** | Queues require Workers Paid — Workflows are free-tier eligible and give durable, retriable multi-step ingestion. |
| Object storage | **R2** (optional) | 10 GB free, zero egress. Caches posters so we don't hot-link TMDB. |
| Cache | **KV** | Search-result and popular-query cache. |
| Eval | **`packages/eval`** | Recall@k / MRR / nDCG@10 for retrieval; LLM-as-judge groundedness for blurbs. Runs in CI. |

**Everything above is Cloudflare free tier.** The only paid dependency is optional: an
Anthropic API key for higher-quality blurb generation, run offline from a laptop.

---

## Architecture

```
                        ┌─────────────────────────────────────────────┐
   Browser ──────────►  │  apps/web   Next.js 15 / OpenNext (Workers)  │
                        │  - landing / browse / search / title pages   │
                        └───────────────┬─────────────────────────────┘
                                        │ service binding (env.API)
                        ┌───────────────▼─────────────────────────────┐
                        │  apps/api   Hono (Workers)                   │
                        │  GET /search   hybrid | lexical | semantic   │
                        │  GET /titles/:id   GET /collections/:slug    │
                        │  POST /feedback                              │
                        │                                             │
                        │  ai/     rewrite-query · classify · blurb    │
                        │  search/ lexical(D1 FTS5) · semantic(Vec) ·  │
                        │          hybrid(RRF)                         │
                        └──┬─────────┬──────────┬─────────┬────────────┘
                           │         │          │         │
                     ┌─────▼──┐ ┌────▼────┐ ┌───▼───┐ ┌───▼────────┐
                     │  D1    │ │Vectorize│ │  KV   │ │ Workers AI │
                     │ +FTS5  │ │ bge-m3  │ │ cache │ │ / AI GW →  │
                     └────────┘ └─────────┘ └───────┘ │  Claude    │
                           ▲                          └────────────┘
                           │ writes
                ┌──────────┴───────────────────────────────────────┐
                │  apps/ingest   Workflow + Cron (Workers)          │
                │  seed/TMDB/OMDb → normalize → D1 → embed → Vec    │
                │  → classify (inclusion_type + themes) → blurb     │
                │  → human-review queue (ingest_jobs)              │
                └──────────────────────────────────────────────────┘

   packages/core   types · zod schemas · taxonomy · RRF · prompts · LLM provider
   packages/eval   retrieval metrics · groundedness judge · golden query set
```

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
packages/
  core/       shared types, zod schemas, taxonomy, RRF, prompts, LLM provider abstraction
  eval/       retrieval + groundedness evaluation harness
infra/
  README.md   resource creation commands (D1, Vectorize, KV, R2, AI Gateway)
```

---

## Getting started

```bash
pnpm install
cp .dev.vars.example apps/api/.dev.vars      # fill TMDB_API_KEY, OMDB_API_KEY, optional ANTHROPIC_API_KEY
```

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
pnpm eval:retrieval      # Recall@k / MRR / nDCG@10 vs packages/eval/src/datasets/queries.jsonl
pnpm eval:groundedness   # LLM-as-judge over generated blurbs
```

Deploy:

```bash
pnpm --filter api deploy
pnpm --filter ingest deploy
pnpm --filter web deploy
```

All changes should go through a branch and pull request targeting `main`.
`.github/workflows/validate-pr.yml` runs the web build, typechecks, and API tests
on every pull request. Protect `main` in GitHub and require this workflow to pass
before merging.

After a pull request is merged, `.github/workflows/deploy-web.yml` deploys the
web Worker from Ubuntu. It can also be started manually. Add these repository
secrets in GitHub:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Then merge a passing pull request, or run **Deploy web Worker** manually.

---

## Free-tier budget (rough, verify against current docs)

| Resource | Free/day | This project's expected load |
|---|---|---|
| Workers requests | 100,000 | search + page views |
| Workers AI neurons | 10,000 | ~10/embedding query, ~50–200/rewrite; classification & blurbs run offline in batches |
| D1 rows read | 5,000,000 | search + detail pages |
| D1 rows written | 100,000 | ingestion + feedback |
| Vectorize queried dims | 30M/mo | 1024 dims × topK 20 × queries |
| KV reads | 100,000 | cache hits |

Runtime cost target: **$0**. Anthropic (optional, offline blurbs): a few dollars one-time
for the whole seed catalog.

---

## Status

Scaffold. Modules have real signatures and TODOs, not full implementations. Start with
`apps/api/src/search/hybrid.ts` and `apps/ingest/src/workflow.ts`.
