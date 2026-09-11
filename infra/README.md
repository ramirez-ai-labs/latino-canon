# Infrastructure

All resources are Cloudflare free tier. Create them once, paste the ids into the
`wrangler.jsonc` files (or run `pnpm infra:create` which does it for you).

## 1. D1 database + FTS5

```bash
wrangler d1 create latino-canon
# → copy database_id into apps/api/wrangler.jsonc and apps/ingest/wrangler.jsonc
pnpm --filter @latino-canon/api db:migrate:remote
```

## 2. Vectorize index

Must match the embedding model: **bge-m3 → 1024 dims, cosine.**

```bash
wrangler vectorize create latino-canon-titles --dimensions=1024 --metric=cosine

# metadata indexes for filter push-down (create BEFORE inserting vectors)
wrangler vectorize create-metadata-index latino-canon-titles --property-name=kind   --type=string
wrangler vectorize create-metadata-index latino-canon-titles --property-name=decade --type=number
wrangler vectorize create-metadata-index latino-canon-titles --property-name=themes --type=string
wrangler vectorize create-metadata-index latino-canon-titles --property-name=inclusionTypes --type=string
```

## 3. KV (search cache)

```bash
wrangler kv namespace create CACHE
# → copy id into apps/api/wrangler.jsonc
```

## 4. R2 (posters)

```bash
wrangler r2 bucket create latino-canon-posters
```

## 5. AI Gateway

**Dashboard only** — `wrangler ai-gateway create` doesn't exist in the current CLI
(checked against wrangler 4.130.0; AI Gateway management isn't exposed via `wrangler`
at all right now). Create it at **dashboard → AI → AI Gateway → Create Gateway**,
named exactly `latino-canon` — it must match `AI_GATEWAY_ID` in both
`apps/api/wrangler.jsonc` and `apps/ingest/wrangler.jsonc`.

This step is easy to skip by accident since nothing else in `infra:create` depends on
it, but every `env.AI.run(...)` call in this codebase passes a `gateway: { id: ... }`
option and **fails outright** (`AiGatewayError: 2001`) if that gateway doesn't exist -
so `classify`/`blurb`/query-rewrite all break, not just AI Gateway's caching/logging.

Enable caching + analytics in the dashboard. When using Claude, add the Anthropic
API key as a gateway BYOK secret or pass it per-request (current setup passes per-request).

## 6. Secrets

```bash
# api
cd apps/api
wrangler secret put CF_ACCOUNT_ID
wrangler secret put ANTHROPIC_API_KEY   # optional

# ingest
cd ../ingest
wrangler secret put TMDB_API_KEY
wrangler secret put OMDB_API_KEY
wrangler secret put CF_ACCOUNT_ID
wrangler secret put ANTHROPIC_API_KEY   # optional
wrangler secret put INGEST_ADMIN_TOKEN
```

## 7. Deploy order

```bash
pnpm --filter @latino-canon/api deploy      # api first (web binds to it by name)
pnpm --filter @latino-canon/ingest deploy
pnpm --filter @latino-canon/web deploy
```

## 8. GitHub Actions: auto-ingest new canon titles

`.github/workflows/ingest-new-titles.yml` triggers a title's ingestion automatically
once a PR that adds it to `apps/ingest/src/seed/canon.seed.json` merges to `main` —
so adding a title to the canon doesn't need a manual `curl`/CLI call against the
deployed worker. It needs the *deployed* ingest worker's URL and admin token as
repo-level GitHub config (Settings → Secrets and variables → Actions):

```text
INGEST_URL            (Variable) — e.g. https://latino-canon-ingest.<acct>.workers.dev
INGEST_ADMIN_TOKEN     (Secret)   — same value as the wrangler secret set in step 6
```

`INGEST_URL` is a Variable, not a Secret, since it's just the worker's public URL —
nothing sensitive about it.

## Free-tier ceilings to watch

| Resource | Free limit | Mitigation |
|---|---|---|
| Workers AI | 10,000 neurons/day | classify + blurb run in batches of 4 via the seed script; cron mops up |
| D1 | 500 MB, 100k writes/day | catalog is small; ingestion is bursty not continuous |
| Vectorize | check current dashboard quota | 1 index, ~few thousand vectors |
| Workflows | check current limits | one instance per title, short-lived |
