# Latino Canon API Documentation

The Latino Canon API provides hybrid semantic + lexical search, in English and Spanish, over a curated catalog of 219 Latino films and series.

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

**Hybrid search: BM25 keyword retrieval + `bge-m3` semantic retrieval, fused with Reciprocal Rank Fusion.**

**Parameters:**
- `q` (optional): free-text query, up to 200 characters, English or Spanish. Empty `q` lists titles by popularity (browse).
- `mode` (optional): `hybrid` (default), `lexical`, or `semantic`
- `limit` (optional): 1–51, default 50
- `offset` (optional): pagination offset
- Filters (optional): `kind` (`film` | `series` | `special`), `decade` (e.g. `1990`), `country` (ISO 3166-1 alpha-2), `theme`, `inclusionType`, `genre` (e.g. `Animation`, `Documentary`), `contentAdvisory` (`general`)

**How filters apply:**
- **Filters you pass as parameters always exclude** titles that don't match.
- A natural-language `q` is also read by an LLM that may **infer** filters ("animation films" → `genre=Animation`, `kind=film`). Inferred filters are applied according to what's left of the query:
  - **Only filters, no real content** ("animation films", "películas animadas"): the inferred filters exclude, and matching titles are listed by popularity. If that matches nothing, inferred filters are dropped one at a time (country and decade first, genre last).
  - **Real content** ("Lin-Manuel Miranda musical Washington Heights"): inferred filters only **boost** matching titles. A wrong guess can't exclude the right answer.
- `interpretation` in the response shows what the rewrite understood, which filters were applied, and `filterMode`: `"strict"` (excluded) or `"boost"` (re-ranked only).

**Example:**
```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=animation+films&limit=10"
```

**Response (abridged):**
```json
{
  "query": "animation films",
  "mode": "hybrid",
  "interpretation": {
    "cleanedQuery": "films",
    "filters": { "kind": "film", "genre": "Animation" },
    "rationale": "The phrase specifies animation films...",
    "source": "llm",
    "filterMode": "strict"
  },
  "results": [
    {
      "id": "coco-2017",
      "kind": "film",
      "title": "Coco",
      "yearStart": 2017,
      "director": "Lee Unkrich",
      "blurbTeaser": "Coco is a film about a boy who dreams of becoming a musician...",
      "inclusionTypes": ["about_community", "breakthrough", "starring"],
      "themes": ["family", "identity"],
      "genres": ["Family", "Animation", "Music", "Adventure"],
      "contentAdvisory": "general",
      "score": 10.2
    }
  ],
  "tookMs": 145
}
```

Results are cached per deployed version of the API (a new deploy never serves results computed by the previous code).

---

### `GET /titles/{id}`

**Full title: metadata, credits, tags with confidence, and the "why it matters" blurb with its sources.**

Each blurb source carries the `id` the blurb cites inline (`[s1]` = synopsis, `[d0]` = first director credit) and the `text` the blurb model was given, so every claim can be traced to its evidence.

```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/titles/coco-2017"
```

---

### `GET /titles`

**List title ids.**

**Parameters:**
- `limit`: up to 10000, default 1000
- `hasBlurb=1`: only titles with an approved blurb (used by the groundedness eval)
- `recent=1`: most recently added titles

---

### `GET /collections` and `GET /collections/{slug}`

**Curated and smart collections.** Current slugs: `core-canon`, `border-stories`, `latina-directors`, `breakthrough-firsts`.

```bash
curl "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/collections/core-canon"
```

---

### `POST /agents/curate`

**Curation agent: a multi-step search with a visible reasoning trail.** Handles signals plain `/search` can't: director gender, lead-actor gender, and tone ("lighter", "heavier").

```bash
curl -X POST "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/agents/curate" \
  -H "content-type: application/json" \
  -d '{"query": "films directed by women with a female lead", "limit": 5}'
```

Returns `topResults`, the `extractedIntent`, and a step-by-step `reasoning` array.

---

### `GET /eval-runs`

**Recorded eval runs, newest first** (retrieval and groundedness). Parameters: `type` (`retrieval` | `groundedness`), `limit` (up to 100). Written only by CI.

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

No API key required. Only `POST /agents/curate` is rate-limited: **10 requests per minute per IP** (each request can make up to two Workers AI calls). Over the limit it returns `429`. Other endpoints have no per-client limit; search is protected by its result cache.

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

- **Search results** are cached in KV for **1 hour**, keyed by the deployed API version plus the interpreted query, filters, mode, limit and offset. A new deploy starts with an empty cache.
- **Posters** are served with `Cache-Control: public, max-age=86400`.
- Other responses aren't cached.

---

## Admin Endpoints

The API also provides operational admin routes for search-index maintenance (no auth required; deployed as Cloudflare Workers):

- **`POST /admin/rebuild-vectorize`** — Re-embed all titles with current genre/content-advisory metadata and upsert to Vectorize. Use after backfill operations or when embedding logic changes. Returns `{ "embedded": 223, "total": 223, "status": "success" }`.

For a complete list of admin and backfill operations (ingest worker), see [INGEST_API.md](INGEST_API.md).

---

## Useful Links

- **GitHub:** https://github.com/ramirez-ai-labs/latino-canon
- **Live Demo:** https://latino-canon-web.ai-builders-studio-latinx.workers.dev
- **Evaluation:** the site's `/eval` page (retrieval by query type, groundedness history)
- **Architecture:** See [README.md](../README.md) for system design
- **Ingest Pipeline:** See [INGEST.md](INGEST.md) for data ingestion
- **Admin APIs:** See [INGEST_API.md](INGEST_API.md) for backfill + rebuild endpoints

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
