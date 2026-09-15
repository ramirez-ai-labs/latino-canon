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

## Option 2: Full Ingest Pipeline (Quota Cost: ~2 calls/film)

**Use case:** Complete ingestion with TMDB metadata, AI classification, and blurb generation.

**Cost:** ~2 Workers AI neurons per title (classification + blurb generation)
- 31 films = ~62 neurons (well within 10k daily limit)

**Run:**

```bash
# Option A: Local dev server
INGEST_ADMIN_TOKEN=dev-only-change-me pnpm --filter @latino-canon/ingest seed

# Option B: Remote deployed worker
INGEST_ADMIN_TOKEN=<your-token> INGEST_URL=https://latino-canon-ingest.<account>.workers.dev pnpm --filter @latino-canon/ingest seed
```

**What it does (per title):**
1. Resolve TMDB ID (search or use pinned `tmdbId` from seed)
2. Fetch full metadata from TMDB (credits, ratings, poster URL)
3. Fetch IMDb ratings from OMDB
4. Normalize title data
5. **[QUOTA]** Run Workers AI classifier (inclusion_types + themes)
6. **[QUOTA]** Generate blurb using Workers AI
7. Persist everything: title, tags, embeddings, blurb
8. Cache poster to R2
9. Route low-confidence results to manual review queue

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
