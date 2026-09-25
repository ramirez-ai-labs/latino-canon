# Strategic Backfill Plan — Genre & Content Advisory (Sept 24, 2026)

## Current State
- **Total titles:** 219
- **Genres backfilled:** ~115 (52%)
- **Content advisory backfilled:** ~120 (55%)
- **Remaining:** ~100-105 titles without genres

---

## Why Strategic Batching Matters

### Constraints Discovered
1. **Ingest worker subrequest limit:** Can't process all 219 in one batch
   - Initial attempt: Checked 166, updated 50, hit rate limit
   - Solution: Batch in 20-30 title chunks
   
2. **Vectorize rate limiting:** Can't upsert 200+ vectors at once
   - Error: `VECTOR_UPSERT_ERROR (code = 40041): Too Many Requests`
   - Solution: Batch 10-20 vectors at a time with delays

3. **TMDB API rate limiting:** Concurrent calls can trigger throttling
   - Solution: Sequential batches with delay between them

---

## Recommended Backfill Strategy

### Phase 1: Batch Completion (Genres)

**Goal:** Get genres for ALL 219 titles (currently 52% complete)

**Approach:** Run 10 sequential batches of 20 titles
- Each batch calls `/backfill-genres` with limit=20
- 2-3 second delay between batches
- Verify each batch's returned count
- Total time: ~2-3 minutes

**Command:**
```powershell
$env:INGEST_URL = "https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev"
$env:INGEST_ADMIN_TOKEN = "your-token"

# Run 10 batches of 20 titles each
for ($i = 1; $i -le 10; $i++) {
  Write-Host "Batch $i starting..."
  $response = curl -X POST "$env:INGEST_URL/backfill-genres" `
    -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" `
    -H "Content-Type: application/json" `
    -d '{"limit": 20}' | ConvertFrom-Json
  
  Write-Host "Batch $i: checked=$($response.checked), updated=$($response.updated), errors=$($response.errors.length)"
  
  if ($response.checked -eq 0) {
    Write-Host "No more titles to backfill. Stopping."
    break
  }
  
  Start-Sleep -Seconds 3
}

Write-Host "Genre backfill complete!"
```

### Phase 2: Content Advisory Completion

**Goal:** Get content advisory for ALL 219 titles (currently 55% complete)

**Approach:** Run 10 sequential batches of 20 titles
- Same batching strategy as genres
- Expect some validation errors (long rationales) — that's OK
- Total time: ~2-3 minutes

**Command:**
```powershell
# Run 10 batches of 20 titles each
for ($i = 1; $i -le 10; $i++) {
  Write-Host "Batch $i starting..."
  $response = curl -X POST "$env:INGEST_URL/backfill-content-advisory" `
    -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" `
    -H "Content-Type: application/json" `
    -d '{"limit": 20}' | ConvertFrom-Json
  
  Write-Host "Batch $i: checked=$($response.checked), updated=$($response.updated), errors=$($response.errors.length)"
  
  if ($response.checked -eq 0) {
    Write-Host "No more titles to backfill. Stopping."
    break
  }
  
  Start-Sleep -Seconds 3
}

Write-Host "Content advisory backfill complete!"
```

### Phase 3: Vectorize Rebuild

**Goal:** Re-embed all titles with new genre/advisory data

**Approach:** the ingest worker's token-protected, paged `POST /rebuild-vectors`.
(This plan originally called the api's `/admin/rebuild-vectorize`, which had no auth and
has since been removed.)

**Command:**
```bash
INGEST_URL=https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev \
INGEST_ADMIN_TOKEN=... pnpm --filter @latino-canon/ingest rebuild:vectors 20
```

### Phase 4: Cache Invalidation

**Goal:** Clear search cache so new data surfaces immediately

**Command:**
```powershell
$response = curl -X POST "https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/rebuild-search-cache" `
  -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" | ConvertFrom-Json

Write-Host "Cache cleared: $($response.message)"
```

### Phase 5: Verification

**Goal:** Confirm search results are correct

**What to test:**
1. Search "animation films" → should show 6 animated films (Coco, Encanto, Ferdinand, Vivo, Book of Life, TheyDream)
2. Filter by "General" content advisory → should show 5 family-friendly options
3. Search "amores perros" (non-animated) → should NOT appear in animated films filter
4. Check title detail pages show genres (if UI updated)

---

## Monitoring During Backfill

### Success Indicators
- Each batch returns `checked > 0`
- Updated count decreases over time (fewer unprocessed titles)
- Errors list contains only known issues (long rationales)
- Final batch returns `checked = 0` (all done)

### Red Flags
- Persistent `checked = 0` in early batches (endpoint not working)
- Rate limit errors increasing (need longer delays)
- No changes between batches (data issue)

### Sample Output (Expected)
```
Batch 1: checked=20, updated=18, errors=0
Batch 2: checked=20, updated=19, errors=0
Batch 3: checked=20, updated=20, errors=0
...
Batch 9: checked=15, updated=15, errors=0
Batch 10: checked=0, updated=0, errors=0
[DONE: All 219 titles have genres]
```

---

## Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Genres (10×20) | 2-3 min | Sequential batches, 3s delay |
| Content Advisory (10×20) | 2-3 min | Sequential batches, 3s delay |
| Vectorize Rebuild | 5-10 min | May hit rate limits, retry logic |
| Cache Clear | <1 min | Single endpoint call |
| **Total** | **10-20 min** | All phases sequential |

---

## Contingency Plans

### If Genres Backfill Fails Partway
- Note which batch failed
- Retry that batch with limit=20
- If still fails, retry with limit=10
- Continue from next batch

### If Vectorize Rate-Limits
- Wait 5-10 seconds
- Retry the rebuild call
- Each retry will process remaining unembedded titles
- Continue until all 219 embedded

### If Content Advisory Has Errors
- Expected errors: long rationale field (~5-10 titles)
- These are acceptable — rationale exceeds 280 char limit
- Fix can come later; focus on getting data in for now

---

## Post-Backfill Checklist

- [ ] Genre backfill complete (all 219 tiles)
- [ ] Content advisory backfill complete (all 219 titles)
- [ ] Vectorize rebuild successful (all 219 embedded)
- [ ] Search cache cleared
- [ ] "animation films" search shows correct results
- [ ] Non-animated films filtered out correctly
- [ ] Book of Life and Vivo appear in results
- [ ] No errors in API logs

---

## Future Improvements

### To Prevent This Complexity
1. **Paginate backfill responses** — Show offset/limit to continue where left off
2. **Add progress tracking** — Endpoint returns "X of 219 complete"
3. **Batch Vectorize rebuilds in the endpoint itself** — Don't make client do retry logic
4. **Add metrics** — Track backfill completion percentage automatically

### To Handle Scale Better
1. **Implement job queue** — Batch large operations asynchronously
2. **Add backpressure handling** — Respect rate limits automatically
3. **Create monitoring dashboard** — See data completeness at a glance
4. **Document limits** — Clear communication of subrequest/rate limits

---

## Key Takeaway

**Strategic batching works.** Small batches (20 titles) + delays (3 seconds) successfully:
- ✅ Avoid ingest worker subrequest limits
- ✅ Complete within reasonable time
- ✅ Allow monitoring/verification
- ✅ Provide recovery points if something fails

**The path is clear:** Run 10 genre batches + 10 content advisory batches + Vectorize rebuild + cache clear. Total time: ~15 minutes.
