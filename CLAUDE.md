# latino-canon — CLAUDE.md

## What Is This?

A search and curation product for Latino-led films and series: "type anything and find it"
retrieval (including Spanish and half-remembered plots) over a small, editorially curated
catalog with context on why each title matters. Live, with ~220 titles in production.

Three Cloudflare Workers plus shared packages, all on the **free tier**:

- `apps/web`: Next.js 15 on OpenNext. It calls `api` over a service binding.
- `apps/api`: Hono. `/search` (hybrid / lexical / semantic), `/titles`, `/collections`,
  `/agents/curate`, `/eval-runs`, and Swagger at `/docs`.
- `apps/ingest`: Workflow + cron. Seed → TMDB/OMDb → D1 → classify → embed → blurb →
  review queue. Also hosts every admin endpoint, behind `INGEST_ADMIN_TOKEN`.
- `packages/core`: types, zod schemas, taxonomy, RRF, prompts, the embedding contract
  and the LLM client.
- `packages/eval`: retrieval metrics, groundedness judge, golden query set.

The README is the architecture reference. `docs/ROADMAP.md` is the prioritized backlog;
read the relevant section before starting feature work.

## Why It Exists

A portfolio piece for AI platform / forward-deployed roles: a production RAG-style
system where every AI component is **observable, evaluated, and costed**. The
differentiators are the evals that gate deploys, the incident history
(`docs/operations/monitoring.md`), and an explicit, defensible operationalization of
"Latino-focused". It's also a community project, tied to the AI Builders: LatinX
Edition podcast and Latino AI Summit talks.

## Architecture Decisions

### 1. Free tier only, no closed-model dependency

Everything runs on Workers AI, D1, Vectorize, KV and R2. Runtime cost target: **$0**.
Workflows are used instead of Queues because Queues require Workers Paid. A decision
that adds a paid dependency must be made explicitly, never backed into.

### 2. The Workers AI neuron budget is the binding constraint

The budget is 10k neurons/day, **account-wide** (shared with other projects), and resets
at 00:00 UTC. Running out breaks live search, not just ingest. Measured costs:

| Job | Neurons |
| --- | --- |
| Live search | ~0.5–0.7k/day |
| Ingest classify+blurb (70B), per batch day | 3–11k |
| Groundedness judge run | ~2.8k |
| Retrieval eval | ~0.15k hybrid, ~0.4k all modes |

Rules:

- Never run production evals or backfills ad hoc to "check" something. Use targeted
  `curl` queries against the live api instead.
- Run at most one 70B job (judge run, blurb regeneration) per day, and never on an ingest
  day. Validate on a ~30-title sample first, then roll out in daily batches.
- Add a handful of titles per day, not dozens.
- Anything public that calls Workers AI needs a cache and a per-client limit in front of
  it (the Rate Limiting binding). Don't add per-request KV writes: the free tier allows
  1,000 per day, and the search cache already uses them.

### 3. Hybrid retrieval: BM25 + bge-m3, fused with weighted RRF

D1 FTS5 (BM25) and Vectorize (`bge-m3`, 1024-dim, multilingual) run in parallel and are
fused with RRF (`k=60`, weights `[2,1]` favoring lexical). The weights were tuned against
the golden set, so don't retune them without an eval run. `MIN_SEMANTIC_SCORE = 0.35` is
a deliberate recall@10 trade-off, documented in `semantic.ts`.

### 4. Inferred filters re-rank; explicit filters exclude

The LLM query rewrite guesses filters (genre, decade, etc.), and one wrong guess used to
exclude the right answer (recall@5 fell from 0.83 to 0.68). Only explicit query-param
filters exclude. Inferred ones boost, unless the query is filter-only. See `runSearch` in
`apps/api/src/search/run-search.ts`, which `/search` and the curation agent share.

### 5. "Latino-focused" is an explicit taxonomy, not a genre tag

The six `inclusion_type` values are `led_by`, `created_by`, `about_community`,
`breakthrough`, `starring` and `produced_by` (`INCLUSION_TYPES` in
`packages/core/src/taxonomy.ts`). The policy itself lives in
`apps/ingest/src/seed/CRITERIA.md`. Tag precedence is **editor > seed > model**. Model
tags below `MODEL_TAG_DISPLAY_THRESHOLD` are never shown or embedded, and low-confidence
classifications go to the `needs_review` queue.

### 6. One embedding contract

Every Vectorize writer uses `titleEmbeddingText` / `titleVectorMetadata` from
`packages/core/src/embedding.ts`. Having three copies once wiped the `kind`/`decade`
metadata and broke every filtered semantic query (incident 4).

### 7. Evals are deploy gates, not demos

- The retrieval eval (77-query golden set, per-category scores) runs after every api
  deploy. It fails if hybrid recall@5 drops more than 0.03 against the last passing run
  on the same golden set.
- The groundedness judge is **frozen at v3** (`GROUNDEDNESS_JUDGE_VERSION` in
  `packages/core/src/prompts.ts`). Scores only compare within a judge version.
- Earlier invalid runs stay on the Eval page, labeled invalid. Correct the record; don't
  delete it.

### 8. Degrade, don't fail

If the embedding call fails (for example, neurons run out), search returns keyword
results flagged `degraded: true`. Those responses are never cached, and the eval refuses
to score them. The query-rewrite LLM falls back to a rules pass. The search cache is
checked before any AI call, keyed on the normalized raw query plus the deployed version.

### 9. No admin routes on the public api

Index maintenance spends the shared neuron budget, so it lives on the ingest worker
behind `INGEST_ADMIN_TOKEN`: `/rebuild-vectors`, `/rebuild-search-cache` and the
backfills. An unauthenticated `/admin/rebuild-vectorize` has shipped on the api
twice (#211, #222). `search.test.ts` now fails if it comes back.

## Extension Points

### Adding a title to the canon

1. Verify every credit independently against `apps/ingest/src/seed/CRITERIA.md`. Past
   mistakes include wrong directors, wrong years, duplicate entries, and wrong films.
2. Edit `apps/ingest/src/seed/canon.seed.json` with a verified, pinned `tmdbId`, and open
   a `content:` PR. CI (`scripts/validate-seed.ts`) rejects duplicates, unknown inclusion
   types, new entries without `tmdbId`, and titles that disappear without a `removed`
   ledger entry (a merge once silently dropped seven). After merging `main` into a seed
   branch, check that nothing from other PRs was lost. At ingest, a match more than 2 years from the
   seed year, or whose TMDB titles don't resemble the seed title or an alias, is rejected
   (`isYearMismatch`, `isTitleMismatch`). Open the TMDB page for every pin you add.
3. Merge any time: the ingest worker's daily queue ingests the next 15 pinned seed
   entries that aren't live (`ingest-queue.ts`, cron 08:00 UTC). `GET /queue` shows the
   order and anything held. `ingest-new-titles.yml` is a manual override only.

### Adding a migration

Add `apps/api/migrations/NNNN_*.sql`. It applies automatically on the api deploy. A
migration that tags or annotates a title added in the **same** PR will silently no-op,
because it runs before ingestion finishes. Ship it as a follow-up PR once the title is
live.

### Adding a search facet

Use #206 (genre + content advisory) as the template. It touched:

- `packages/core`: `types.ts`, `schema.ts`, `taxonomy.ts`, `prompts.ts`
- a migration
- `apps/ingest`: `normalize.ts`, `persist.ts`, `sources/tmdb.ts`
- `apps/api`: `search/filters.ts` (`filterToSql` / `filterToVectorize`), `db/cards.ts`,
  `routes/search.ts`
- `apps/web`: `lib/api.ts`, `SearchFilters`

A facet that Vectorize metadata carries also needs a vector rebuild.

### Changing what a vector is built from

1. Edit `packages/core/src/embedding.ts`.
2. After deploy, run `pnpm --filter @latino-canon/ingest rebuild:vectors` (needs
   `INGEST_URL` and `INGEST_ADMIN_TOKEN`).
3. Clear the search cache with `POST /rebuild-search-cache`.

### Adding a golden query

Append the query to `packages/eval/src/datasets/queries.jsonl`, after verifying the
answer against the live catalog. Changing the set changes its hash, so the next run
becomes the new gate baseline.

### Adding a Workers AI call

Route it through `LlmClient` (`apps/api/src/llm/`), which goes through AI Gateway. Put a
cache and a rate limit in front of it, and add its measured cost to the budget table in
README and `monitoring.md`.

## Known Limitations

1. **No daily cap on `/search`.** The per-client limit (30/min) stops bursts, but many
   IPs or one sustained caller can still drain the budget. Nothing tracks cumulative
   neuron spend in code (ROADMAP #15).
2. **Spanish search lags:** recall@5 is 0.453, against 0.799 for the same queries in
   English (ROADMAP 5b).
3. **Blurb groundedness is 0.682.** Most failures are one unsupported "It matters…"
   sentence (ROADMAP item 6).
4. **The curation agent is a fixed 4-step pipeline.** No LLM chooses its tools.
5. **`/titles/:id/similar` is a stub.**
6. **`apps/web` has no tests.**
7. **Deploy ordering:** migrations and new-title ingestion run in parallel on merge
   (see "Adding a migration").

## Future Work

See `docs/ROADMAP.md` for the authoritative list. Current order:

1. Exact-title matches always win (item 4).
2. Rewrite rework: search on the user's original words and let the LLM extract filters
   only (item 5).
3. Diagnose Spanish search (5b).
4. A remote MCP server over search, titles and curate.
5. Classifier eval (item 8).
6. Better blurbs (item 6).

## Testing

```bash
pnpm typecheck && pnpm lint && pnpm test      # what validate-pr.yml runs, plus the web build
pnpm --filter @latino-canon/api test          # workerd suite (*.test.ts) + node suite (*.node.spec.ts)
pnpm --filter @latino-canon/ingest test       # unit + D1-backed suite (*.d1.spec.ts)
```

- Suites that touch bindings run on real local D1/KV/R2 via
  `@cloudflare/vitest-pool-workers`. `wrangler.test.jsonc` binds no AI or Vectorize,
  which doubles as the "Workers AI unavailable" scenario.
- `lexical.eval.test.ts` is a fixture-backed BM25 regression test that uses the same
  metrics as `pnpm eval:retrieval`.
- **Local gotcha 1:** the repo path contains spaces (`Ramirez AI Labs`), which breaks
  every workerd suite locally ("No such module … threads.js"). To run them, rsync the
  repo (minus `node_modules`, `.next` and `.git`) to a space-free path and run
  `pnpm install --frozen-lockfile --offline` there. CI is unaffected.
- **Local gotcha 2:** this Mac runs macOS 12.6, below workerd's 13.5 minimum, so
  `wrangler dev` and the OpenNext web build can't run locally. `wrangler deploy
  --dry-run` still validates config.

## Deployment

- Everything goes through a branch and a PR to `main`. No direct pushes.
- Use conventional prefixes: `feat`, `fix`, `docs`, `content`, `design`, `chore`.
- Merging deploys only the Worker(s) whose `apps/<name>/**` changed. A change under
  `packages/core/**` redeploys all three.
- The api deploy applies D1 migrations first, then triggers the retrieval eval.
- Groundedness runs are manual (`eval-groundedness.yml`).
- Releases are cut from **Actions → Release** (semver; current `1.2.0`).
- CI secrets are `CLOUDFLARE_API_TOKEN` (needs D1:Edit) and `CLOUDFLARE_ACCOUNT_ID`.
  Worker secrets are `TMDB_API_KEY`, `OMDB_API_KEY` and `INGEST_ADMIN_TOKEN`, all on
  ingest. See `infra/README.md`.

## Conventions

- Comments explain *why*, usually citing the incident or PR behind them ("Found live:
  …"). Keep that style, and don't strip the history from existing comments.
- ESLint allows only `console.warn` / `console.error`. Log structured JSON lines
  (`console.warn(JSON.stringify({ event: "…" }))`), which Workers Logs indexes.
- New Workers ambient types (e.g. `RateLimit`) must be added to the `eslint.config.js`
  globals.
- D1 caps a statement at 100 bound params. Reserve room when building `IN (...)` lists.
- Ranking changes need a before/after eval number in the PR, not intuition.

## Related Reading

- `README.md`: architecture, free-tier budget, eval results
- `docs/ROADMAP.md`: backlog and design philosophy (Spotify retrieval + Netflix curation)
- `docs/operations/monitoring.md`: incident runbook, neuron-budget checks
- `apps/ingest/src/seed/CRITERIA.md`: inclusion policy
- `docs/API.md`, `docs/INGEST_API.md`: endpoint references
- `.github/WORKFLOWS.md`: CI/CD triggers
