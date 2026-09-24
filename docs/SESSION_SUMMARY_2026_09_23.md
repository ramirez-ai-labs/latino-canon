# Session Summary: Genre & Content Advisory Backfill (Sept 23, 2026)

## Objective
Enable search for animated films (and other genre-filtered content) by backfilling genre and content-advisory data to all 219 titles in the canon, and fixing search indexing to surface these changes.

---

## Work Completed

### 1. PR #207: Genre & Content Advisory Classification ✅ MERGED
**Status:** Complete and deployed  
**What it did:**
- Added `genres` (JSON array) and `content_advisory` (scalar) columns to titles table
- Implemented LLM-based content advisory classification ("general" vs "mature")
- Created `/backfill-genres` endpoint (TMDB-only, no AI cost)
- Created `/backfill-content-advisory` endpoint (LLM classification)
- Wired both into the ingest pipeline for new titles
- **Bug fixes:** Fixed `leadActor` extraction in page.tsx and local-data.ts to sort by cast order before selecting

**Results:**
- Initial 50-title test: 50 genres backfilled, 49 content advisory ratings (1 validation error)
- Full batched run (35-title chunks): 115 genres backfilled total, 120 content advisory ratings

### 2. PR #208: Rebuild Search Cache Endpoint ✅ MERGED
**Status:** Complete and deployed  
**What it did:**
- Added `/rebuild-search-cache` endpoint to the ingest worker
- Clears KV cache of all search results so new data appears immediately
- Required after backfills since search results are cached by query+filters

**Issue found:** Missing CACHE KV binding in wrangler.jsonc

### 3. PR #209: Add CACHE KV Namespace Binding ✅ MERGED
**Status:** Complete and deployed  
**What it did:**
- Added `kv_namespaces` config to ingest worker wrangler.jsonc
- Points to shared CACHE namespace (id: `3cbc7e31b2de454db393f22775cc17ce`)
- Required for `/rebuild-search-cache` endpoint to function

### 4. PR #210: Backfill Book of Life Animation Genre ✅ MERGED
**Status:** Complete and deployed  
**What it did:**
- Created D1 migration 0021 to manually add Animation genre to Book of Life (2014)
- Needed because Book of Life wasn't caught by initial backfill batches
- Migration auto-ran on API deployment

**Result:** Database updated, but search still not showing it

### 5. PR #211: Rebuild Vectorize Endpoint ✅ MERGED
**Status:** Complete, but needs batching  
**What it did:**
- Added `POST /admin/rebuild-vectorize` endpoint to API
- Re-embeds all titles using AI and upserts vectors to Vectorize
- Needed because backfills update D1 but don't update Vectorize semantic search index

**Issue discovered:** Rate limited when upsert batching all 219 titles at once
- Error: `VECTOR_UPSERT_ERROR (code = 40041): Too Many Requests`
- Workaround: Need to batch upserts (maybe 10-20 at a time)

---

## Issues Discovered & Troubleshooting

### Issue 1: Search Cache vs Vectorize Index
**Problem:** Clearing the KV cache alone didn't fix search results
**Root cause:** Vectorize (semantic search index) is separate from KV cache. Backfilled data wasn't in Vectorize vectors
**Solution:** Created `/admin/rebuild-vectorize` endpoint to re-embed titles
**Status:** Working, but hit rate limits

### Issue 2: Book of Life Not Appearing
**Problem:** Added Animation genre via migration, but search still didn't show it
**Root cause:** Two reasons:
1. Vectorize didn't have the vector for Book of Life (or it was stale)
2. Only ~120/219 titles had genres backfilled, so semantic search was too broad

**Solution:** 
- Rebuild Vectorize (done, but hit rate limits)
- Backfill ALL 219 titles with genres (in progress)

### Issue 3: Vectorize Rate Limiting
**Problem:** When rebuilding all 219 vectors at once, hit rate limit
**Error:** `VECTOR_UPSERT_ERROR (code = 40041): Too Many Requests`
**Root cause:** Vectorize has a rate limit on concurrent upserts
**Solution needed:** Batch the upserts in the endpoint (10-20 at a time with delays)

### Issue 4: Incomplete Genre Backfill
**Problem:** Only ~120 of 219 titles have Animation genre
**Root cause:** Initial backfill used small batch sizes (35-title chunks) to avoid ingest worker subrequest limits. Ran out after ~120 titles.
**Solution:** Run backfill again with same small batches to catch remaining 100 titles

---

## Current State

### Backfill Status
| Titles | Genres | Content Advisory | Notes |
|--------|--------|------------------|-------|
| 219 total | ~115 (52%) | ~120 (55%) | Only partial backfill due to batching |

### Search Results
- **Query:** "animation films" with `genre:Animation` filter
- **Results:** 40 items shown, but MOST are NOT animated
- **Why:** Only 52% of titles have genres, so filter is ineffective. Semantic search matches thematically but can't exclude non-animated films
- **Example non-animated in results:** Amores Perros, Y Tu Mamá También, Gloria, Wild Tales

---

## Next Steps (Blockers)

### Immediate (Required)
1. **Complete genre backfill for all 219 titles**
   - Run backfill in small batches (10 iterations × 20-title chunks)
   - All titles need a genre (or empty `[]`) for filter to work correctly

2. **Fix Vectorize rebuild batching**
   - Update `/admin/rebuild-vectorize` endpoint to batch upserts
   - Upsert 10-20 vectors at a time with 100ms delays between batches
   - Prevents rate limiting

3. **Re-run rebuild sequence**
   - Backfill all genres
   - Rebuild Vectorize (with batching)
   - Clear search cache
   - Test search results

### Nice-to-Have
- Add UI display of genres on title detail pages (currently they're in DB but not shown)
- Create a monitoring endpoint to check backfill progress
- Add retry logic to rebuild endpoints in case of transient errors

---

## Lessons Learned

1. **KV Cache vs Search Index:** These are different layers
   - KV cache: caches query results (cleared by `/rebuild-search-cache`)
   - Vectorize: semantic search vectors (rebuilt by `/admin/rebuild-vectorize`)
   - Clearing cache doesn't help if search index is stale

2. **Backfill Batching:** Ingest worker has subrequest limits
   - Initial backfill of 219 titles in one go failed (subrequest limit exceeded)
   - Solution: run multiple small batches (35-40 titles each)
   - This means backfill endpoints should report progress/count

3. **Vectorize Rate Limits:** Can't upsert 200+ vectors in parallel
   - Need to batch and add delays
   - Suggested: 10-20 vectors per batch with 100ms delay

4. **Semantic Search Post-Filters:** Genre filter is applied AFTER semantic search
   - Vectorize returns candidates by vector similarity
   - D1 re-checks them against structured filters (genre, country, etc.)
   - If most titles have no genres, the semantic search result set becomes too broad

---

## PRs Created This Session
| PR | Status | Purpose |
|----|--------|---------|
| #207 | ✅ Merged | Genre & content advisory backfill endpoints |
| #208 | ✅ Merged | Search cache rebuild endpoint |
| #209 | ✅ Merged | CACHE KV binding for ingest worker |
| #210 | ✅ Merged | Book of Life animation genre migration |
| #211 | ✅ Merged | Vectorize rebuild endpoint (needs batching fix) |

---

## Test Plan for Next Session

Once all 219 titles have genres:

1. Run backfill:
   ```bash
   for i in {1..10}; do
     pnpm -F @latino-canon/ingest run backfill:genres -- 20
     sleep 2
   done
   ```

2. Rebuild Vectorize (with batching):
   ```bash
   curl -X POST https://latino-canon-api.ai-builders-studio-latinx.workers.dev/admin/rebuild-vectorize
   ```

3. Clear cache:
   ```bash
   curl -X POST https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/rebuild-search-cache \
     -H "Authorization: Bearer $INGEST_ADMIN_TOKEN"
   ```

4. Search "animation films" and verify:
   - ✅ Book of Life appears
   - ✅ Vivo appears
   - ✅ Ferdinand appears
   - ✅ Encanto appears
   - ✅ Coco appears
   - ❌ Non-animated films (Amores Perros, Gloria, etc.) do NOT appear

---

## Files Modified
- `apps/api/migrations/0021_backfill_book_of_life_animation_genre.sql` (NEW)
- `apps/api/src/routes/admin.ts` (NEW)
- `apps/api/src/index.ts`
- `apps/ingest/src/index.ts`
- `apps/ingest/src/openapi.ts`
- `apps/ingest/src/bindings.ts`
- `apps/ingest/wrangler.jsonc`
- `apps/web/src/app/page.tsx` (leadActor sort fix)
- `apps/web/src/lib/local-data.ts` (leadActor sort fix)
