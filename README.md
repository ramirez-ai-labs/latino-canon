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
| LLM inference | **Workers AI** | Runtime path (query rewriting) and offline path (classification, blurb generation) both run on Workers AI (10k neurons/day free) — no closed-model provider, deployed app costs $0. |
| LLM observability | **AI Gateway** | Free. Caching, logging, and per-request metadata in front of Workers AI. |
| Async pipelines | **Workflows + Cron Triggers** | Queues require Workers Paid — Workflows are free-tier eligible and give durable, retriable multi-step ingestion. |
| Object storage | **R2** (optional) | 10 GB free, zero egress. Caches posters so we don't hot-link TMDB. |
| Cache | **KV** | Search-result and popular-query cache. |
| Eval | **`packages/eval`** | Recall@k / MRR / nDCG@10 for retrieval; LLM-as-judge groundedness for blurbs. Runs in CI. |

**Everything above is Cloudflare free tier, with no paid or closed-model dependency.**

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
                        │  ai/     rewrite-query                       │
                        │  search/ lexical(D1 FTS5) · semantic(Vec) ·  │
                        │          hybrid(RRF)                         │
                        └──┬─────────┬──────────┬─────────┬────────────┘
                           │         │          │         │
                     ┌─────▼──┐ ┌────▼────┐ ┌───▼───┐ ┌───▼────────┐
                     │  D1    │ │Vectorize│ │  KV   │ │ Workers AI │
                     │ +FTS5  │ │ bge-m3  │ │ cache │ │  / AI GW   │
                     └────────┘ └─────────┘ └───────┘ └────────────┘
                           ▲
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
cp apps/ingest/.dev.vars.example apps/ingest/.dev.vars   # fill TMDB_API_KEY, OMDB_API_KEY
cp apps/api/.dev.vars.example apps/api/.dev.vars
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
pnpm eval:retrieval      # Recall@k / MRR / nDCG@10 vs packages/eval/src/datasets/queries.jsonl
                         # (needs a running api with real seeded data — hybrid/semantic
                         # modes are only as good as the ingest pipeline behind them)
pnpm eval:groundedness   # LLM-as-judge over generated blurbs (needs CF_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)
```

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
```

All changes should go through a branch and pull request targeting `main`.
`.github/workflows/validate-pr.yml` runs the web build, typechecks every workspace
package, and runs their test suites on every pull request — including a
fixture-backed BM25 retrieval regression test (`apps/api/src/search/lexical.eval.test.ts`)
that exercises the real `lexicalSearch` → `titles_fts` path and the same
`packages/eval` metrics (recall@k, MRR) used by `pnpm eval:retrieval`, entirely locally
via `@cloudflare/vitest-pool-workers` — no Cloudflare account or deployed data needed.
Protect `main` in GitHub and require this workflow to pass before merging.

After a pull request is merged, `.github/workflows/deploy-web.yml`,
`deploy-api.yml`, and `deploy-ingest.yml` each deploy their Worker from Ubuntu —
each is scoped by `paths:` to its own `apps/<name>/**`, so only the Worker(s) whose
code actually changed redeploy; a change under `packages/core/**` (shared by all
three) redeploys all of them. Each can also be started manually from **Actions**.
Add these repository secrets in GitHub:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Then merge a passing pull request, or run **Deploy web Worker** / **Deploy api
Worker** / **Deploy ingest Worker** manually.

Pull requests are labeled automatically by changed area and conventional title
prefix. Releases are created manually from **Actions -> Release** using a
semantic version such as `0.1.0`; the workflow creates a tag like
`latino-canon-v0.1.0`, generates release notes, and supports prereleases.

Adding a title to the canon is a normal PR: edit
`apps/ingest/src/seed/canon.seed.json`, open a PR, get it reviewed. Once merged,
`.github/workflows/ingest-new-titles.yml` diffs the seed file and `POST`s just the
newly added entries to the deployed ingest worker automatically — no manual
`curl`/CLI step. See [infra/README.md](infra/README.md#8-github-actions-auto-ingest-new-canon-titles)
for the one-time GitHub Actions config it needs. This is separate from
`deploy-ingest.yml` above: `ingest-new-titles.yml` sends data to whichever code is
already live, it never redeploys the Worker's own code.

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

Runtime cost target: **$0**, including ingestion — no paid or closed-model dependency
anywhere in the stack.

---

## Evaluation results

`pnpm eval:retrieval` run for real against the deployed `api` worker, all 16 seed
titles ingested through the live Workflow (real TMDB/OMDb data, real `bge-m3`
embeddings, real classify/blurb output) — not a fixture:

| mode | recall@5 | recall@10 | P@5 | MRR | nDCG@10 |
|---|---|---|---|---|---|
| lexical | 0.856 | 0.878 | 0.227 | 0.706 | 0.737 |
| semantic | 0.889 | 0.944 | 0.240 | 0.897 | 0.885 |
| **hybrid** | **0.889** | **0.967** | 0.240 | 0.839 | 0.864 |

All 15 golden queries (`packages/eval/src/datasets/queries.jsonl`) hit in hybrid's
top 5. Honest caveats: it's a 16-title catalog and a 15-query golden set — real
signal, not yet enough to responsibly tune `hybrid.ts`'s fixed `[1, 1]` RRF weights
or `semantic.ts`'s `MIN_SEMANTIC_SCORE` floor against; both are still hand-picked
heuristics pending a larger golden set. `pnpm eval:groundedness` (LLM-as-judge over
generated blurbs) is implemented but still takes title ids as manual CLI args rather
than enumerating the catalog itself — a real groundedness number for the whole
canon hasn't been run yet.

## Status

The ingest resolve → fetch → normalize → persist → classify → embed → blurb path
is implemented and has been run end-to-end against live TMDB/OMDb and a deployed
Workflow (`pnpm --filter ingest seed`) — all 16 seed titles are ingested, classified,
embedded, and blurbed in production D1/Vectorize, not just covered by fixture tests.

`GET /titles/:id` hydrates the full `Title` (metadata + credits + tags + approved
blurb) from D1 rather than returning a raw row, and poster images are served from R2
via a dedicated `/posters` route (`apps/api/src/routes/titles.ts`,
`apps/api/src/routes/posters.ts`).

Other open scaffold items: RRF weights are still fixed at `[1, 1]`
(`apps/api/src/search/hybrid.ts`) and `semantic.ts`'s minimum score floor is a
hand-picked heuristic — both pending a larger golden query set to tune against;
`/titles/:id/similar` still returns a stub instead of Vectorize nearest-neighbors; the
nightly cron's retry/refresh logic is unimplemented (`apps/ingest/src/maintenance.ts`)
— `retryErroredJobs` bumps the attempt counter but doesn't reconstruct params and
requeue the Workflow (a `force: true` re-`POST /ingest` is the current manual
workaround), and `refreshPopularity` is a no-op. `apps/api/src/ai/classify.ts` and
`blurb.ts` (plus the `LlmClient` provider abstraction under them) are unused
dead code — the real classify/blurb calls live in `apps/ingest/src/ai.ts` instead,
calling Workers AI directly.
