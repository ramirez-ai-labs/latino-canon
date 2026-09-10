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

```bash
wrangler ai-gateway create latino-canon
```

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

## Free-tier ceilings to watch

| Resource | Free limit | Mitigation |
|---|---|---|
| Workers AI | 10,000 neurons/day | classify + blurb run in batches of 4 via the seed script; cron mops up |
| D1 | 500 MB, 100k writes/day | catalog is small; ingestion is bursty not continuous |
| Vectorize | check current dashboard quota | 1 index, ~few thousand vectors |
| Workflows | check current limits | one instance per title, short-lived |
