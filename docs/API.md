# Latino Canon API Documentation

The Latino Canon API provides hybrid semantic + lexical search over a curated catalog of 219 Latino films and series.

## Interactive Documentation

**🚀 [Open Swagger UI →](https://latino-canon-api.ai-builders-studio-latinx.workers.dev/docs)**

Self-hosted, interactive API explorer with request/response examples, filters, and live testing.

---

## OpenAPI Specification

The API is documented via **OpenAPI 3.0**:

**Live spec:** `https://latino-canon-api.ai-builders-studio-latinx.workers.dev/openapi.json`

**Health check:**
```bash
curl https://latino-canon-api.ai-builders-studio-latinx.workers.dev/healthz
```

### Alternative Documentation Viewers

**View in external Swagger UI:**
```
https://swagger.io/tools/swagger-ui/
```
Then paste: `https://latino-canon-api.ai-builders-studio-latinx.workers.dev/openapi.json`

**View in ReDoc:**
```
https://redoc.ly/
```
Paste the OpenAPI URL to view a beautiful API reference.

**Generate Client Code:**
Use [OpenAPI Generator](https://openapi-generator.tech/) to generate SDKs in TypeScript, Python, Go, etc.:

```bash
npx @openapitools/openapi-generator-cli generate \
  -i https://latino-canon-api.ai-builders-studio-latinx.workers.dev/openapi.json \
  -g typescript-fetch \
  -o ./generated-client
```

---

## Core Endpoints

### `GET /search`

**Hybrid search combining BM25 lexical + semantic retrieval with RRF ranking.**

**Parameters:**
- `q` (required): Search query (e.g., "border crossing", "family films")
- `mode` (optional): `hybrid` (default), `lexical`, or `semantic`
- `limit` (optional): 1-100, default 20
- `offset` (optional): Pagination offset
- `country`, `decade`, `theme`, `inclusionType`, `kind`: Filter options

**Example:**
```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=border+crossing&limit=10"
```

**Response:**
```json
{
  "query": "border crossing",
  "mode": "hybrid",
  "results": [
    {
      "id": "el-norte-1983",
      "title": "El Norte",
      "year": 1983,
      "kind": "film",
      "synopsis": "...",
      "themes": ["Immigration", "Family"],
      "inclusionTypes": ["led_by", "about_community"]
    }
  ],
  "tookMs": 145
}
```

---

### `GET /titles`

**List all titles in the catalog with optional filtering.**

**Parameters:**
- `limit`: 1-10000, default 100
- `offset`: Pagination offset
- `hasBlurb`: Filter to only titles with AI-generated blurbs (for eval pipelines)

**Example:**
```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/titles?limit=50"
```

---

### `GET /collections/{slug}`

**Get a curated or smart collection.**

**Collections available:**
- `core-canon`: Core Latino films & series (featured)
- `border-stories`: Films about border crossing & immigration
- `queer-latino`: Films centering queer Latino identities
- `directors-spotlight`: Films directed by Latino directors

**Example:**
```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/collections/core-canon"
```

---

## Search Modes

| Mode | Algorithm | Strengths | Weaknesses |
|------|-----------|-----------|-----------|
| `hybrid` (default) | BM25 + embeddings (RRF) | Accurate, balanced | Slightly slower |
| `lexical` | BM25 keyword search | Fast, exact matches | Misses synonyms |
| `semantic` | Dense embeddings (bge-m3) | Finds thematic matches | Can be fuzzy |

**Recommendation:** Use `hybrid` for discovery; use `lexical` for fast exact matches; use `semantic` for thematic exploration.

---

## Retrieval Quality

**Golden Query Set:** 77 curated queries in five categories, 219 titles (hybrid mode, 2026-09-24)
- **Recall@5:** 0.763 (76% of correct answers in the top 5 results)
- **Recall@10:** 0.849 (85% in the top 10)
- **MRR (Mean Reciprocal Rank):** 0.736 (how high the first correct result ranks, on average)
- Runs after every api deploy and weekly; per-category scores are on the site's Eval page.

**Blurb Groundedness:** Mean 0.682 (211 blurbs, judge v3)
- Share of each blurb's claims supported by the sources it was written from (synopsis, credits)
- Earlier published scores (e.g. 0.486) were invalid: the judge never saw the source text before #216

---

## Rate Limits

No API key required. Rate limits are per IP:
- **100 requests/minute** for search queries
- **1000 requests/minute** for other endpoints

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1695830400
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid query parameters |
| 404 | Not found (e.g., collection doesn't exist) |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

## Caching

Responses are cached for **5 minutes**:
- Search queries are cached by: query string + filters + limit + offset
- All responses include `Cache-Control: public, max-age=300`

---

## Useful Links

- **GitHub:** https://github.com/ramirez-ai-labs/latino-canon
- **Live Demo:** https://latino-canon.ai-builders-studio-latinx.workers.dev
- **Evaluation:** `/eval` dashboard with groundedness scores
- **Architecture:** See [README.md](../README.md) for system design
- **Ingest Pipeline:** See [INGEST.md](../INGEST.md) for data ingestion

---

## Example Workflows

### Discover Films by Theme
```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=identity+and+coming+of+age&limit=10"
```

### Find Films by Country
```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=films&country=MX&limit=20"
```

### Browse a Decade
```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=films&decade=1980&limit=50"
```

### Compare Lexical vs Semantic
```bash
# What lexical search finds:
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=amor&mode=lexical"

# What semantic search finds:
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=amor&mode=semantic"

# Hybrid combination:
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=amor&mode=hybrid"
```

---

## Questions?

For issues or feature requests, open an issue on [GitHub](https://github.com/ramirez-ai-labs/latino-canon/issues).
