# Canon Ingestion Guide

Two approaches to ingest titles into the latino-canon database:

## Option 1: Seed-Only Load (Zero Quota Cost)

**Use case:** Quickly load seed data without TMDB fetching, classification, or blurb generation. Verifies JSON structure and database insertion.

**Cost:** ~0 Workers AI neurons (just D1 writes)

**Run:**

```bash
# Option A: Local dev server (wrangler dev on :8788)
INGEST_ADMIN_TOKEN=dev-only-change-me pnpm --filter @latino-canon/ingest seed:only

# Option B: Remote deployed worker
INGEST_ADMIN_TOKEN=<your-token> INGEST_URL=https://latino-canon-ingest.<account>.workers.dev pnpm --filter @latino-canon/ingest seed:only
```

**What it does:**
1. Reads seed titles from `apps/ingest/src/seed/canon.seed.json`
2. Inserts each title into D1 with basic metadata (title, year, kind, poster placeholder)
3. Adds seed inclusion_types as tags (from `seedInclusionTypes` field)
4. Skips existing titles silently
5. **Does NOT** fetch TMDB, classify, generate blurbs, or cache posters

**Example output:**
```
Response (200): {"inserted":31,"skipped":0,"details":{"inserted":[...],"skipped":[]}}
```

---

## Option 2: Full Ingest Pipeline (Quota Cost: ~100–150 neurons/title)

**Use case:** Complete ingestion with TMDB metadata, AI classification, and blurb generation.

**Cost:** roughly **100–150 Workers AI neurons per title**: two 70B calls (classify,
blurb) plus a small 8B content-advisory call and one embedding. Measured: an ~85-title
session burned ~11k neurons, over the 10k daily allocation (see
[monitoring.md incident #3](operations/monitoring.md)). Keep a day's batch well under ~60
titles, and don't ingest on a day that also runs the groundedness eval (~2.8k).

**Run:**

```bash
# Option A: Local dev server
INGEST_ADMIN_TOKEN=dev-only-change-me pnpm --filter @latino-canon/ingest seed

# Option B: Remote deployed worker
INGEST_ADMIN_TOKEN=<your-token> INGEST_URL=https://latino-canon-ingest.<account>.workers.dev pnpm --filter @latino-canon/ingest seed
```

**What it does (per title, each a durable, independently retried Workflow step):**
1. Resolve the TMDB id (search, or the seed's pinned `tmdbId`)
2. Fetch TMDB details (credits, genres, poster) and OMDb ratings
3. **Validation gates:** skip TMDB `adult` titles; reject a pinned `tmdbId` whose release
   year is more than 2 years off the seed's (it points at the wrong title)
4. Normalize, then persist the title, people and credits. Every write re-indexes the
   title's keyword-search row (`titles_fts`) from D1: title, original title, synopsis,
   people, confident tag labels + genres, aliases
5. Cache the poster to R2
6. **[70B]** Classify inclusion types + themes, then write tags with editor > seed > model
   precedence (a title with no inclusion type is never shown)
7. **[8B]** Classify content advisory (`general` / `mature`)
8. **[embedding]** Embed and upsert to Vectorize, using the shared contract in
   `packages/core/src/embedding.ts` (text: title, original title, synopsis, genres, themes
   at ≥ 0.6 confidence; metadata: `kind`, `decade`)
9. **[70B]** Generate the "why it matters" blurb, stored unapproved, with each source's
   cited id and text (`s1` synopsis, `d0…` directors) so it can be checked later
10. Route to the review queue when no seed inclusion type exists and the model isn't
    confident

**Workflow batching:**
- Posts in batches of 4 titles with 5-second delays between batches (keeps neuron usage steady)
- Each title runs as an independent Workflow for retry resilience
- Failed steps auto-retry with exponential backoff

---

## Recommended Workflow

For the current session (29 titles):

```bash
# 1. Validate seed load (1 minute, no quota)
pnpm --filter @latino-canon/ingest seed:only

# 2. Verify data appears in D1/UI
# - Check pagination works with expanded dataset
# - Spot-check a few seed titles in web UI

# 3. Later: Run full ingest (5-10 minutes, ~58 neurons)
pnpm --filter @latino-canon/ingest seed
# Monitors jobs with: GET /jobs endpoint
# Low-confidence results tagged for manual review
```

---

## Backfilling director/cast gender (zero quota cost)

`gender` on `people` was added after most of the catalog was already ingested, so
existing rows have it as `NULL` until either a `force: true` re-ingest touches them or
this runs. TMDB-only — no Workers AI neurons spent.

```bash
INGEST_ADMIN_TOKEN=<your-token> pnpm --filter @latino-canon/ingest backfill:gender 50
```

Processes up to `limit` (default 50, first CLI arg) people with `tmdb_id` set and
`gender` still unknown, one TMDB `/person/{id}` call each. Re-run with a higher limit,
or call it a few times, to work through the rest of the backlog — safe to run
repeatedly, since it only ever touches rows still missing a gender.

## Checking Ingest Status

**Monitor job queue (full ingest only):**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8788/jobs
```

Returns jobs in `needs_review` or `error` status. Example response:
```json
{
  "jobs": [
    {
      "id": "job_black_god_white_devil_1964",
      "ref": "Black God, White Devil (1964)",
      "status": "needs_review",
      "stage": "classify",
      "error": null
    }
  ]
}
```

---

## Seed Data Format

`apps/ingest/src/seed/canon.seed.json` structure:

```json
{
  "titles": [
    {
      "ref": "Amores Perros (2000)",
      "title": "Amores Perros",
      "year": 2000,
      "kind": "film",
      "seedInclusionTypes": ["led_by", "about_community", "breakthrough"],
      "tmdbId": 1234  // optional: pin exact TMDB ID to avoid search ambiguity
    }
  ]
}
```

**Fields:**
- `ref`: Display reference (used for job tracking)
- `title`: Canonical title
- `year`: Release year
- `kind`: "film" or "series"
- `seedInclusionTypes`: Array of authoritative inclusion types (classifier still runs to measure agreement)
- `tmdbId` (optional): Pin exact TMDB ID when search might be ambiguous

---

## Environment Variables

**Local dev:**
```bash
INGEST_ADMIN_TOKEN=dev-only-change-me
INGEST_URL=http://localhost:8788  # default
```

**Remote deployed:**
```bash
INGEST_ADMIN_TOKEN=$(grep INGEST_ADMIN_TOKEN .dev.vars)
INGEST_URL=https://latino-canon-ingest.<account>.workers.dev
```

---

## Free Tier Constraints

- **Workers Workflows:** Free tier eligible
- **Workers AI (Claude):** 10k neurons/day
  - Classifier call: ~100-200 neurons per title
  - Blurb call: ~100-200 neurons per title
  - Batching (4 titles @ 5s delay) keeps costs smooth
- **D1:** Included (reads/writes under 1M/day)
- **R2 (Posters):** ~$0.015/GB (likely <$1/month for full catalog)

---

## Troubleshooting

**Seed titles not appearing:**
- Check INGEST_ADMIN_TOKEN matches
- Verify D1 has `titles` and `title_tags` tables
- Check response status (should be 200)

**Workflow jobs stuck in "running":**
- Check `/jobs` endpoint for error details
- Retry manually if it was a transient error (network, timeout)
- Review stage column to see where it failed

**Workers AI budget exhausted:**
- Quota resets at 00:00 UTC
- Can continue with seed:only loads (zero quota)
- Full ingest (classify + blurb) paused until reset
- Live search degrades too: the query rewrite falls back to keyword rules, but vector
  search needs the query embedding

**Any script (`seed`, `seed:only`, `backfill:gender`) fails with `401 unauthorized`:**
- Most common cause: the command was run from inside `apps/ingest/` instead of the repo
  root. `pnpm --filter @latino-canon/ingest run <script>` itself works from anywhere in
  the monorepo, but a `.dev.vars` path typed *inside* the command
  (`grep INGEST_ADMIN_TOKEN apps/ingest/.dev.vars`) resolves against your current shell
  directory, not the filtered package — from inside `apps/ingest/`, that path means
  `apps/ingest/apps/ingest/.dev.vars`, which doesn't exist, so `grep` finds nothing and
  the token comes through as an empty string instead of erroring loudly.
- Fix: run from the repo root, or drop the leading `apps/ingest/` from the `.dev.vars`
  path if you're already inside that directory.
- `POST /backfill-gender` also has its own limit: it makes one TMDB fetch per person
  checked, and Cloudflare's free-tier Workers plan caps subrequests at 50 per
  invocation — `limit` values above 50 fail partway through with
  `Too many subrequests by single Worker invocation`. 50 is the actual ceiling, not
  just the default.
