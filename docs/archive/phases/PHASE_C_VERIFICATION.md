# Phase C: Verification & Error Recovery

## Timeline
1. **PR #111 merged** ✅ (seed cleanup)
2. **PR #112 ready** (database cleanup) — merge next
3. **Phase C starts** (this doc)

---

## Step 1: Verify Database Cleanup

**After merging PR #112**, execute cleanup endpoint:

```bash
INGEST_ADMIN_TOKEN=your_token
curl -X POST https://ingest.latino-canon.com/cleanup/remove-invalid-tmdb \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response** (all 13 titles cleaned):
```json
{
  "status": "success",
  "deleted": {
    "ingest_jobs": 13,
    "blurbs": 13,
    "title_tags": 50,
    "credits": 120,
    "people": 30,
    "titles": 13
  },
  "verified": {
    "ingest_jobs": 0,
    "titles": 0,
    "title_tags": 0,
    "blurbs": 0,
    "credits": 0
  }
}
```

**Verify manually** (via D1 dashboard):
```sql
-- Should all return 0
SELECT COUNT(*) FROM titles WHERE id IN (
  'the-offended-2016',
  'ultimos-dias-en-la-habana-2016',
  'el-amparo-2016',
  'the-movie-of-my-life-2017',
  'a-wolf-at-the-door-2013',
  'the-thin-yellow-line-2015',
  'the-boy-and-the-world-2013',
  'the-golden-dream-2013',
  'the-liberator-2013',
  'the-delay-2012',
  'tattoo-2013',
  'elite-squad-2-the-enemy-within-2010',
  'love-for-sale-2006'
);
```

---

## Step 2: Re-ingest El Chavo del 8

**Issue**: El Chavo del 8 was added via `seed-load` (bypassed TMDB enrichment).  
**Solution**: Re-ingest via full workflow to populate TMDB metadata.

### Add to seed first (if not already there)

Check `apps/ingest/src/seed/canon.seed.json` for El Chavo entry:

```json
{ 
  "ref": "El Chavo del 8 (1973)", 
  "title": "El Chavo del 8", 
  "year": 1973, 
  "kind": "series", 
  "tmdbId": 8134,
  "seedInclusionTypes": ["led_by", "created_by", "about_community", "breakthrough"] 
}
```

If missing, add it.

### Trigger workflow ingest

```bash
curl -X POST https://ingest.latino-canon.com/ingest \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "titles": [
      {
        "ref": "El Chavo del 8 (1973)",
        "title": "El Chavo del 8",
        "year": 1973,
        "kind": "series",
        "tmdbId": 8134,
        "seedInclusionTypes": ["led_by", "created_by", "about_community", "breakthrough"],
        "force": true
      }
    ]
  }'
```

**Expected Response**:
```json
{
  "started": ["job_el_chavo_del_8_1973"]
}
```

### Verify workflow completes

Check `/jobs` endpoint:
```bash
curl -X GET https://ingest.latino-canon.com/jobs \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" | jq '.jobs[] | select(.title_ref == "El Chavo del 8 (1973)")'
```

**Expected**: Status should be `"done"` (not `"needs_review"` or `"error"`).

### Verify in UI

Search for "El Chavo" in the UI — should see:
- ✅ Full title "El Chavo del 8"
- ✅ Poster image
- ✅ Correct year (1973)
- ✅ Synopsis from TMDB
- ✅ Tags (inclusion types + themes)
- ✅ Popularity score

---

## Step 3: Monitor Error Jobs (Nightly Cron)

Three titles still in `error` status from earlier attempts:
- Monarca
- The Dead Girls
- Taco Chronicles

The nightly cron (`0 8 * * *` UTC) retries errored jobs up to 3 times.

### Check current error jobs

```bash
curl -X GET https://ingest.latino-canon.com/jobs \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" | jq '.jobs[] | select(.status == "error")'
```

**Expected output**: Show status, stage, error message, and retry count.

### Wait for cron retry

The nightly cron runs at 8 AM UTC. After it runs:

```bash
# Check if retried and resolved
curl -X GET https://ingest.latino-canon.com/jobs \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" | jq '.jobs[] | select(.title_ref | test("Monarca|The Dead Girls|Taco Chronicles"))'
```

**Expected**: Status should move from `"error"` → `"done"` or `"needs_review"`.

### If still failing

If cron retry doesn't resolve, check error message:
```bash
curl -X GET https://ingest.latino-canon.com/jobs \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" | jq '.jobs[] | select(.status == "error") | {title_ref, stage, error}'
```

**Common issues**:
- **Classification stage**: Model not confident → needs editor review (expected)
- **Fetch stage**: TMDB 404 → title data changed or missing
- **Network stage**: Transient error → will retry on next cron

---

## Step 4: Verify UI Completeness

### Search for key titles

Test these searches in the UI:
- ✅ "El Chavo" → should appear with full metadata
- ✅ "Monarca" → should appear and be fully classified
- ✅ "The Dead Girls" → should appear and be fully classified
- ✅ "Taco Chronicles" → should appear and be fully classified

### Check tag classification

For any `needs_review` titles, verify:
- Low model confidence scores (not bugs)
- Tags make sense for the title
- Can approve in UI or via `/approve-jobs` endpoint

### Monitor for regressions

Search for a few known good titles:
- "Coco" → should appear normally
- "In the Heights" → should appear normally
- "Jane the Virgin" → should appear normally

---

## Step 5: Track Results

Document completion in a verification log:

```markdown
## Phase C Verification Log

**Date**: [YYYY-MM-DD]

### Database Cleanup
- [ ] PR #112 merged
- [ ] Cleanup endpoint called
- [ ] Verified counts: all deleted > 0, verified = 0
- [ ] SQL query confirms 0 orphaned titles

### El Chavo del 8 Re-ingest
- [ ] Entry added to seed (if missing)
- [ ] Workflow triggered
- [ ] Job reached `done` status
- [ ] UI search shows full metadata + poster

### Error Job Monitoring
- [ ] Checked current error jobs
- [ ] Nightly cron ran (or scheduled)
- [ ] Monarca status: _________
- [ ] The Dead Girls status: _________
- [ ] Taco Chronicles status: _________

### UI Verification
- [ ] El Chavo searches found
- [ ] No regression in known good titles
- [ ] 3 error titles showing correct classification

### Issues Found
- [ ] None
- [ ] [List any issues]
```

---

## Phase D Preview

Once Phase C completes:
```bash
cd apps/ingest
pnpm build && npx wrangler deploy
```

This deploys:
- Schema fix (optional themes)
- Cleanup endpoint
- Any bug fixes from PRs #110–#112

---

## Need Help?

- Check `/jobs` for detailed error messages
- Review workflow logs in Cloudflare dashboard
- Re-run cleanup if needed (idempotent)
- Check git log for related PRs: `git log --oneline --grep="ingest"`
