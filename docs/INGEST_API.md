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

### `POST /aliases` (Admin)

Backfill or update alternate titles for a title already in the catalog.
Use this instead of `force: true` re-ingest when only aliases changed.

**Request:**
```json
{
  "titleId": "la-bamba-1987",
  "aliases": [
    { "alias": "La Bamba", "kind": "en_title" },
    { "alias": "Ritmo y Movimiento", "kind": "es_title" }
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

Jobs store their original `IngestParams` in the database. To retry:

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
