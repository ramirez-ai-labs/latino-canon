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
set. Groundedness runs are triggered by hand (`eval-groundedness.yml`), since each costs
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
`deploy-api.yml`, and `deploy-ingest.yml` each deploy their Worker from Ubuntu —
each is scoped by `paths:` to its own `apps/<name>/**`, so only the Worker(s) whose
code actually changed redeploy; a change under `packages/core/**` (shared by all
three) redeploys all of them. `deploy-api.yml` also applies any pending D1
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
semantic version (current: `1.2.0`); the workflow creates a tag like
`latino-canon-v1.2.0`, generates release notes from merged PRs since the last tag,
and supports prereleases.

Adding a title to the canon is a normal PR: edit
`apps/ingest/src/seed/canon.seed.json` — see
[`apps/ingest/src/seed/CRITERIA.md`](apps/ingest/src/seed/CRITERIA.md) for the
inclusion-type verification checklist first — open a PR, get it reviewed. Merging
doesn't ingest anything by itself: the ingest worker's daily cron (08:00 UTC) runs an
**ingest queue** (`apps/ingest/src/ingest-queue.ts`) that takes the next
`INGEST_QUEUE_PER_DAY` (default 5) pinned seed entries not yet live and starts their
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
| Workers AI neurons | 10,000 | live search ~0.5–0.7k/day; ingest batch days 3–11k; evals below (measured 2026-09-24) |
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
| Ingest classify + blurb | 70B | 3–11k per batch day |
| Groundedness eval, 212 blurbs | 70B | ~2.8k per run |
| Retrieval eval, 77 queries | 8B + bge-m3 | ~0.15k hybrid / ~0.4k all modes |

Rules this project follows: at most one 70B job (groundedness run, blurb regeneration) per
day and never on an ingest day; validate on a sample before full runs; schedules are weekly,
not nightly, unless a deploy triggers them.

Practical guidance: when growing the catalog by more than a handful of titles, spread
large batches across more than one day rather than running them all at once, and treat
"is there other Workers AI activity in this account today" as a real input before
running a big batch — not just this project's own ingest volume. If the catalog's
growth pace outgrows the free tier long-term, Workers AI's paid plan removes the daily
cap; that's a deliberate cost decision to make explicitly, not something to back into
by accident.

---

## Evaluation results

*(Last refreshed 2026-09-24, against the live catalog of 219 titles. Both evals now run
from CI and record to `eval_runs`; the live history is on the site's Eval page.)*

### Retrieval

`pnpm eval:retrieval` runs the golden query set (`packages/eval/src/datasets/queries.jsonl`,
77 queries) against the deployed `api` worker, after every api deploy (hybrid mode) and
weekly (all modes). A run fails when hybrid recall@5 drops more than 0.03 against the last
passing run on the same golden set. Current baseline, hybrid, by query type:

| query type | n | recall@5 | MRR |
|---|---|---|---|
| known-item (exact titles, typos, aliases) | 7 | 1.000 | 0.857 |
| person (director/actor named) | 10 | 0.800 | 0.783 |
| plot (half-remembered descriptions) | 44 | 0.799 | 0.774 |
| facet (genre, kind, decade asks) | 8 | 0.616 | 0.650 |
| **spanish** | 8 | **0.453** | 0.445 |
| **all** | 77 | **0.763** | 0.736 |

The Spanish queries are mostly translations of English plot queries that pass - the
clearest gap against this project's bilingual-search goal, and next on the
[roadmap](docs/ROADMAP.md). Exact titles always land in the top 5 but not always first
("y tu mama tambien" ranks #2), which is the next retrieval fix.

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
that no source supports - the target of the next blurb work.

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

**v1.2.0.** Curation agent, female-lead search, genre and content-advisory facets, and a
full UI redesign shipped after v1.0.0; v1.2.0 adds search index integrity fixes, a
post-deploy retrieval eval, and a groundedness judge that actually sees its evidence (see
the [release notes](https://github.com/ramirez-ai-labs/latino-canon/releases/tag/latino-canon-v1.2.0)). See [docs/ROADMAP.md](docs/ROADMAP.md) for the design philosophy behind
what's built vs. what's next, and a prioritized backlog. See [docs/operations/monitoring.md](docs/operations/monitoring.md)
for how to operate this in production — resource names, AI Gateway/neuron-budget checks, and an
incident response runbook built around six real production incidents. See [docs/FEATURES_COMPLETED.md](docs/FEATURES_COMPLETED.md)
for a summary of all shipped features through v1.0.0.

The ingest resolve → fetch → normalize → persist → classify → embed → blurb path
is implemented and has been run end-to-end against live TMDB/OMDb and a deployed
Workflow — all 219 canon titles are ingested, classified, embedded, and blurbed in
production D1/Vectorize, not just covered by fixture tests.

`GET /titles/:id` hydrates the full `Title` (metadata + credits + tags + approved
blurb, with each source's cited id and text) from D1 rather than returning a raw row, and poster images are served from R2
via a dedicated `/posters` route (`apps/api/src/routes/titles.ts`,
`apps/api/src/routes/posters.ts`).

Other open scaffold items: `semantic.ts`'s minimum score floor (`MIN_SEMANTIC_SCORE
= 0.35`) is still a hand-picked heuristic — tested at 0.45 against the 62-query
golden set and deliberately kept at 0.35 (a real recall@5-vs-recall@10 trade-off,
not a clean win); `/titles/:id/similar` still returns a stub instead of Vectorize
nearest-neighbors. Classify and blurb calls live in `apps/ingest/src/ai.ts`, calling
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
