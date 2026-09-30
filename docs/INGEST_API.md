# Ingest Worker Admin API

The ingest worker (`https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev`) manages all data ingestion and maintenance. **All endpoints require admin authentication.**

## 🚀 Interactive Documentation

**[Open Swagger UI with Auth →](https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/docs)**

Self-hosted API explorer with:
- 🔐 Bearer token authentication form (stored in localStorage)
- 📋 Full endpoint documentation with schemas
- 🧪 Live request/response testing
- ⬇️ OpenAPI spec for client generation

---

## Authentication

All requests must include the admin token:

```bash
curl -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/jobs
```

Set `INGEST_ADMIN_TOKEN` in Cloudflare Worker secrets:
```bash
wrangler secret put INGEST_ADMIN_TOKEN
# Paste your token when prompted
```

For local development, use `.dev.vars`:
```
INGEST_ADMIN_TOKEN=dev-only-change-me
```

---

## Endpoints

### `GET /` (Public)

Health check — no auth required. Returns service status and documentation links.

**Response:**
```json
{
  "service": "latino-canon-ingest",
  "status": "ok",
  "type": "admin-only",
  "requires": "Authorization: Bearer <INGEST_ADMIN_TOKEN>",
  "docs": "/docs"
}
```

### `GET /docs` (Public)

Interactive Swagger UI with authentication. No auth required to view (auth form is built-in).

**Response:** HTML page with Swagger UI + Bearer token input

---

### `GET /openapi.json` (Public)

OpenAPI 3.0 specification for all admin endpoints. Useful for client generation and API documentation tools.

**Response:** JSON OpenAPI spec

---

### `POST /ingest` (Admin)

Kick off one Workflow per title. Each workflow runs the full pipeline:
resolve TMDB → fetch metadata → classify → embed → generate blurb → persist.

**Request:**
```json
{
  "titles": [
    {
      "ref": "la-bamba-1987",
      "kind": "film",
      "title": "La Bamba",
      "year": 1987,
      "tmdbId": 11886,
      "aliases": [
        { "alias": "La Bamba", "kind": "en_title" }
      ],
      "seedInclusionTypes": ["led_by"]
    }
  ]
}
```

**IngestParams schema:**
- `ref` (required): Unique identifier (e.g., slug)
- `kind` (required): `"film"` or `"series"`
- `title` (required): Display title
- `year` (required): Release year
- `tmdbId` (optional): Pin to specific TMDB ID (avoids search mismatches)
- `aliases` (optional): Alternate titles for search
- `seedInclusionTypes` (optional): Pre-tag with `led_by`, `created_by`, `about_community`, `breakthrough`

**Response:**
```json
{
  "started": ["workflow-id-1", "workflow-id-2"]
}
```

**Cost:** ~50 Workers AI neurons per title (classification + blurb generation)

---

### `GET /jobs` (Admin)

List pending and errored ingest jobs (up to 200 most recent).

**Response:**
```json
{
  "jobs": [
    {
      "id": "job-uuid",
      "title_ref": "la-bamba-1987",
      "status": "needs_review",
      "stage": "classify",
      "error": null,
      "created_at": "2026-09-21T12:34:56Z",
      "updated_at": "2026-09-21T12:35:02Z",
      "params": { /* original IngestParams */ }
    },
    {
      "id": "job-uuid-2",
      "title_ref": "otro-film",
      "status": "error",
      "stage": "blurb",
      "error": "Workers AI error: rate limit",
      "created_at": "2026-09-21T12:00:00Z",
      "updated_at": "2026-09-21T12:00:05Z",
      "params": { /* original IngestParams */ }
    }
  ]
}
```

**Statuses:**
- `pending` — In progress
- `needs_review` — Completed; awaiting human review (low confidence)
- `approved` — Reviewed and approved
- `error` — Failed; retry with `POST /ingest` using stored `params`

---

### `GET /queue` (Admin)

What the daily cron (08:00 UTC) will ingest next, without starting anything. The queue
takes seed entries that pin a `tmdbId` no live title has, in seed-file order, up to
`INGEST_QUEUE_PER_DAY` (15) per day.

```json
{
  "next": ["Heli (2013)", "Araby (2017)"],
  "eligible": 35,
  "held": [{ "ref": "Colada (2026)", "reason": "ingested, but no live title has this tmdbId - check for a slug collision" }]
}
```

`held` lists entries the queue won't send because a job already tried their current pin:
it failed a check (wrong film, bad pin), is still running, or is in review. Fix the seed
entry (a new pin re-queues it) or the data; retrying the same pin won't help.

---

### `POST /seed-load` (Admin)

Load seed titles **without** classification, blurb generation, or TMDB fetching. 
Used for fast catalog initialization.

**Request:**
```json
{
  "titles": [
    {
      "ref": "el-norte-1983",
      "title": "El Norte",
      "year": 1983,
      "kind": "film",
      "seedInclusionTypes": ["led_by", "about_community"]
    }
  ]
}
```

**Response:**
```json
{
  "inserted": 2,
  "skipped": 1,
  "details": {
    "inserted": ["el-norte-1983"],
    "skipped": ["existing-title"]
  }
}
```

**Cost:** ~0 Workers AI neurons (D1 writes only)

---

### `POST /backfill-gender` (Admin)

Fetch missing director/cast gender from TMDB for titles already ingested.
Processes up to `limit` people (default 50).

**Request:**
```json
{
  "limit": 100
}
```

**Response:**
```json
{
  "checked": 45,
  "updated": 42,
  "stillUnknown": 3,
  "errors": []
}
```

**Cost:** ~0 Workers AI neurons (TMDB metadata only)

---

### `POST /backfill-genres` (Admin)

Fill `titles.genres` from TMDB for rows still at the `[]` default, then re-index each
updated title's keyword-search row (genres are keyword-searchable). Processes up to
`limit` titles (default 50); keep batches small to stay under the Worker subrequest limit.

**Request:** `{ "limit": 20 }` · **Response:** `{ "checked": 20, "updated": 18, "errors": [] }`

**Cost:** ~0 Workers AI neurons (TMDB metadata only). Genres are part of each title's
embedding text, so run `/rebuild-vectors` afterwards.

---

### `POST /backfill-content-advisory` (Admin)

Classify `general` / `mature` for titles whose `content_advisory` is still null, using the
8B model. Processes up to `limit` titles (default 50).

**Request:** `{ "limit": 20 }` · **Response:** `{ "checked": 20, "updated": 20, "errors": [] }`

**Cost:** small (one 8B call per title).

---

### `POST /regenerate-blurbs` (Admin)

Rewrite blurbs written before the ingest gate (#261–#263) under the current prompt. Candidates, in
order: unapproved blurbs, then approved ones with an unsupported significance claim ("It matters as…"),
then approved ones with citation-style problems; most popular first within each. **A rewrite replaces
the old blurb only if it passes the gate** (v3 judge at 1.0, clean inline citations), and is then
approved by the judge. Otherwise the old blurb stays exactly as it was, the attempt is recorded in
`blurbs.regen_attempted_at`, and the title is retried after 7 days. Up to 10 titles per call.

```bash
pnpm --filter @latino-canon/ingest regenerate:blurbs --dry-run   # backlog by reason, no AI calls
pnpm --filter @latino-canon/ingest regenerate:blurbs 20          # a day's batch, in calls of 10
```

**Request:** `{ "limit": 10, "dryRun": false }` · **Response:**
`{ "considered", "byReason": {unapproved, significance, citations}, "replaced": [], "held": [{titleId, score, problems, unsupported}], "errors": [], "next"? }`

**Cost:** ~100 neurons per title (one 70B blurb call + ~13 for the judge). Budget rule: one 70B job a
day besides the ingest queue, capped at ~2k, so about 20 titles a day. **Enforced:** a non-dry run claims
the day's `blurb-regen` slot first and returns **409** `{ "error": "budget", "reason" }` if another 70B
job (an eval) already has it. Pass `"overrideReason": "<why>"` to run anyway; it's recorded.

---

### `GET /budget` (Admin)

Today's Workers AI 70B ledger (UTC day, `ai_budget_claims`): which heavy jobs ran or claimed the day,
and whether the ingest queue still has work (which makes today an ingest day). Read-only.

```json
{ "day": "2026-09-30", "claims": [{ "kind": "ingest-queue", "claimedAt": "2026-09-30 08:00:03", "reason": null, "override": 0 }], "queueHasWork": false }
```

### `GET /cron` (Admin)

The daily cron's heartbeat (`cron_runs`): one row per run of the 08:00 UTC cron, newest first,
`?limit=` 1-100 (default 14). A count is `null` when its task failed, and the matching error
says why. No row for a day means the cron didn't fire; a row of zeros means it ran with
nothing to do.

```json
{ "runs": [{ "startedAt": "2026-10-01T08:00:00.123Z", "durationMs": 2140, "queueStarted": 0, "jobsRetried": 0, "titlesRefreshed": 12, "queueError": null, "retryError": null, "refreshError": null }] }
```

### `POST /budget/claim` (Admin)

Claims today's 70B slot for a job that runs outside this worker. The groundedness and MCP tool-selection
eval workflows call it before spending, and so does the curation eval when it targets the v2 agent. `kind`
is one of `blurb-regen`, `eval-groundedness`, `eval-mcp-tools`, `eval-classifier`, `eval-curation`.

- **Granted** (200 `{ "granted": true, "override": false }`): nothing else ran today, or only the queue
  ran and the job fits under the ~2k cap.
- **Refused** (409 `{ "granted": false, "reason" }`): a different 70B job already claimed today, or
  it's a full `eval-groundedness` run (~2.8k) on an ingest day or a day the queue still has work.
- **Override:** `{ "kind", "overrideReason": "<why>" }` turns a refusal into a grant, recorded with the reason.

---

### `POST /rebuild-vectors` (Admin)

Re-embed one page of titles from D1 and upsert them to Vectorize, with exactly the text and
metadata ingest writes (`packages/core/src/embedding.ts`: title, original title, synopsis,
genres, confident themes; metadata `kind` + `decade`, which search filters on). One batched
embedding call and one batched upsert per page. Call it with the returned `nextOffset` until
that's `null`, or use the script:

```bash
INGEST_URL=https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev \
  pnpm --filter @latino-canon/ingest rebuild:vectors      # page size defaults to 50
```

**Request:** `{ "offset": 0, "limit": 50 }` (limit max 100) ·
**Response:** `{ "embedded": 50, "total": 219, "nextOffset": 50 }`

**Cost:** a few neurons per page (`bge-m3` embeddings are cheap).

---

### `POST /rebuild-search-cache` (Admin)

Delete cached `/search` results from KV. **Code deploys don't need this**: the api keys its
cache by deployed version, so a deploy starts cold. Use it after a **data** change that
affects results (a backfill or a vector rebuild) so cached pages don't outlive the old data.

**Response:** `{ "status": "success", "message": "Cleared 13 cached search results", "deletedCount": 13 }`

**Cost:** 0 neurons.

---

### `POST /aliases` (Admin)

Backfill or update alternate titles for a title already in the catalog.
Use this instead of `force: true` re-ingest when only aliases changed. Alias kinds:
`translation`, `alt_title`, `misspelling`, `nickname`. Overwrites the title's alias list and
re-indexes its keyword-search row.

**Request:**
```json
{
  "titleId": "la-bamba-1987",
  "aliases": [
    { "alias": "La Bamba: The Ritchie Valens Story", "kind": "alt_title" },
    { "alias": "Labamba", "kind": "misspelling" }
  ]
}
```

**Response:**
```json
{
  "titleId": "la-bamba-1987",
  "aliasCount": 2
}
```

**Cost:** ~0 Workers AI neurons (D1 writes only)

---

### `POST /cleanup/remove-invalid-tmdb` (Admin)

Remove titles with invalid or mismatched TMDB IDs discovered during operations.
Currently hardcoded for known cleanup cases.

**Response:**
```json
{
  "status": "success",
  "deleted": 13,
  "verified": 0,
  "message": "All 13 invalid TMDB entries cleaned from database"
}
```

**Cost:** ~0 Workers AI neurons (D1 deletions only)

---

## Common Workflows

### Add a Single Title

```bash
curl -X POST https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/ingest \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "titles": [{
      "ref": "la-bamba-1987",
      "kind": "film",
      "title": "La Bamba",
      "year": 1987,
      "tmdbId": 11886,
      "seedInclusionTypes": ["led_by"]
    }]
  }'
```

### Batch Add Titles

Post in batches of 4–10 with 5-second delays to avoid Workers AI neuron budget spikes:

```bash
for batch in $(seq 1 5); do
  BATCH=$(( ($batch - 1) * 10 ))
  echo "Batch $batch (titles $BATCH–$(($BATCH + 9)))..."
  curl -X POST ... # POST /ingest with 10 titles
  sleep 5s
done
```

### Monitor Ingestion Progress

```bash
watch -n 5 'curl -s -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/jobs | jq '.jobs | map(.status) | group_by(.) | map({(.[0]): length})'
'
```

### Retry Errored Jobs

The nightly cron already retries errored jobs automatically (up to 3 attempts), replaying
the exact `IngestParams` stored on the job. To retry one by hand:

```bash
curl -X POST https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/ingest \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "titles": [
      { "ref": "failed-title", /* ...original params... */ }
    ]
  }'
```

### After a Backfill: Re-index

Genres and themes feed both indexes, so after a backfill that changes them:

```bash
# 1. Re-embed (vector index); pages until done
pnpm --filter @latino-canon/ingest rebuild:vectors
# 2. Drop cached search results computed from the old data
curl -X POST "$INGEST_URL/rebuild-search-cache" -H "Authorization: Bearer $INGEST_ADMIN_TOKEN"
```

The keyword index (`titles_fts`) needs no step: every write re-indexes the affected title
from D1.

---

## Error Handling

**401 Unauthorized:** Missing or invalid `INGEST_ADMIN_TOKEN`
```json
{ "error": "unauthorized" }
```

**404 Not Found:** Endpoint doesn't exist or title/resource not found
```json
{ "error": "no such title: invalid-id" }
```

**500 Server Error:** Worker or database error
```json
{ "status": "error", "message": "..." }
```

---

## Rate Limiting

No explicit rate limits, but respect Workers AI neuron budget (10,000/day account-wide).
See [README.md](../README.md#the-workers-ai-neuron-budget-is-account-wide-and-ingestion-can-blow-it)
for budget guidance and incident runbook.

---

## See Also

- [INGEST.md](INGEST.md) — User-facing ingestion workflows
- [docs/operations/monitoring.md](operations/monitoring.md) — Incident response & neuron budget tracking
- [README.md](../README.md) — Architecture & free-tier constraints
