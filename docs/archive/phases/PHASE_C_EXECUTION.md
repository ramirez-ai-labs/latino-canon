# Phase C Execution — Live

**Status**: Ready to Execute  
**Prerequisites**: Both PR #111 & #112 merged ✅

---

## Required Information

Before starting, you need:

1. **INGEST_ADMIN_TOKEN** — Set in Cloudflare Workers secrets
2. **INGEST_URL** — Worker URL (typically `https://latino-canon-ingest.*.workers.dev` or custom domain)

Set these environment variables:
```powershell
$env:INGEST_ADMIN_TOKEN = "your_token_here"
$env:INGEST_URL = "https://ingest.latino-canon.com"  # or your actual URL
```

---

## Phase C Step-by-Step Execution

### ✅ Step 1: Database Cleanup (Remove 13 Orphaned Records)

**What**: Calls cleanup endpoint to remove records from 6 tables.

**Command**:
```powershell
$response = curl -X POST "$env:INGEST_URL/cleanup/remove-invalid-tmdb" `
  -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" `
  -H "Content-Type: application/json" | ConvertFrom-Json

$response | ConvertTo-Json
```

**Expected**:
```json
{
  "status": "success",
  "deleted": {
    "ingest_jobs": 13,
    "blurbs": 13,
    "title_tags": 50+,
    "credits": 120+,
    "people": 30+,
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

**✅ Success Criteria**:
- `status = "success"`
- All `deleted` counts > 0
- All `verified` counts = 0

**Document**:
```
Step 1 Result: PASS ✅ / FAIL ❌
Deleted: ingest_jobs=___, titles=___, other=___
Verified: all counts are 0 ✅ / some non-zero ⚠️
```

---

### ✅ Step 2: Re-ingest El Chavo del 8

**What**: Trigger full workflow ingest for El Chavo to populate TMDB metadata.

**Current Issue**: 
- Database has `el-chavo-del-8-1973` with NULL tmdb_id, no metadata
- UI can't display it without TMDB enrichment
- Seed has correct tmdbId=1437

**Command**:
```powershell
$ingestPayload = @{
  titles = @(
    @{
      ref = "El Chavo del 8 (1973)"
      title = "El Chavo del 8"
      year = 1973
      kind = "series"
      tmdbId = 1437
      seedInclusionTypes = @("led_by", "created_by", "about_community", "breakthrough")
      force = $true
    }
  )
} | ConvertTo-Json

$response = curl -X POST "$env:INGEST_URL/ingest" `
  -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" `
  -H "Content-Type: application/json" `
  -d $ingestPayload | ConvertFrom-Json

$response | ConvertTo-Json
```

**Expected**:
```json
{
  "started": ["job_el_chavo_del_8_1973"]
}
```

**Document**:
```
Step 2 Result: PASS ✅ / FAIL ❌
Job ID: job_el_chavo_del_8_1973
```

---

### ✅ Step 3: Check El Chavo Job Status

**What**: Verify workflow completed successfully.

**Wait**: 10–30 seconds after triggering, then check status.

**Command**:
```powershell
$response = curl -X GET "$env:INGEST_URL/jobs" `
  -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" | ConvertFrom-Json

$response.jobs | Where-Object { $_.title_ref -eq "El Chavo del 8 (1973)" } | ConvertTo-Json
```

**Expected**:
```json
{
  "id": "job_el_chavo_del_8_1973",
  "title_ref": "El Chavo del 8 (1973)",
  "stage": "review",
  "status": "done",
  "error": null,
  "updated_at": "2026-09-18T12:34:56Z"
}
```

**Possible Statuses**:
- `"done"` → Success! ✅
- `"needs_review"` → Model low confidence (OK, approve in Step 3b) ⚠️
- `"error"` → Something failed (check error message) ❌

**Document**:
```
Step 3 Result: 
Status: done / needs_review / error
Stage: ___
Error (if any): ___
```

**If needs_review** (Step 3b):

```powershell
curl -X POST "$env:INGEST_URL/approve-jobs" `
  -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"job_ids": ["job_el_chavo_del_8_1973"]}'
```

---

### ✅ Step 4: Verify in UI

**What**: Search for El Chavo in the web UI and confirm it displays correctly.

**Search for**: "El Chavo"

**Expected to see**:
- [ ] Title: "El Chavo del 8"
- [ ] Year: 1973
- [ ] Poster image
- [ ] Full synopsis from TMDB
- [ ] Tags (led_by, created_by, about_community, breakthrough)
- [ ] Popularity score

**Document**:
```
Step 4 Result:
UI Search "El Chavo": FOUND ✅ / NOT FOUND ❌
Display complete: YES ✅ / PARTIAL ⚠️
Poster: YES ✅ / NO ❌
Tags: YES ✅ / NO ❌
```

---

### ✅ Step 5: Regression Test

**What**: Verify existing titles still work (no regressions).

**Search for each** in UI:
- [ ] "Coco"
- [ ] "In the Heights"
- [ ] "Jane the Virgin"
- [ ] "Selena"

**Expected**: All display normally with full metadata.

**Document**:
```
Step 5 Results:
Coco: PASS ✅ / FAIL ❌
In the Heights: PASS ✅ / FAIL ❌
Jane the Virgin: PASS ✅ / FAIL ❌
Selena: PASS ✅ / FAIL ❌

Regressions: NONE ✅ / FOUND ⚠️
```

---

### ⏳ Step 6: Monitor Error Jobs (Automatic)

**What**: Track the 3 error jobs that nightly cron will retry.

**Error Jobs**:
1. Monarca
2. The Dead Girls
3. Taco Chronicles

**Nightly Cron**: Runs 8 AM UTC daily, retries up to 3 times per job.

**Check current status**:
```powershell
$response = curl -X GET "$env:INGEST_URL/jobs" `
  -H "Authorization: Bearer $env:INGEST_ADMIN_TOKEN" | ConvertFrom-Json

$response.jobs | Where-Object { $_.status -eq "error" } | Select-Object title_ref, stage, error | ConvertTo-Json
```

**Document**:
```
Step 6 Initial Status:
Monarca: status=___, stage=___, error=___
The Dead Girls: status=___, stage=___, error=___
Taco Chronicles: status=___, stage=___, error=___

Nightly Cron Runs: [DATE] 8 AM UTC
Re-check after cron:
Monarca: status=___ (retry result)
The Dead Girls: status=___
Taco Chronicles: status=___
```

**After cron runs tomorrow**:
- Expected: All should be `"done"` or `"needs_review"`
- Acceptable: Some might need manual review (low confidence)
- Problem: Still `"error"` (may need investigation)

---

## Phase C Summary

| Step | Task | Status | Time |
|------|------|--------|------|
| 1 | Database cleanup | ⏳ | ~2 min |
| 2 | El Chavo re-ingest | ⏳ | ~1 min |
| 3 | Check job status | ⏳ | ~2 min |
| 4 | UI verification | ⏳ | ~3 min |
| 5 | Regression test | ⏳ | ~3 min |
| 6 | Monitor cron | ⏳ | Monitor (24h) |
| **Total** | **Phase C** | **Ready** | **~20 min + 24h monitoring** |

---

## Phase C Complete When

All of the following are true:
- ✅ Step 1: Database cleanup successful (verified counts = 0)
- ✅ Step 2: El Chavo re-ingest triggered
- ✅ Step 3: Job status is `done` or `needs_review`
- ✅ Step 4: El Chavo appears in UI with full metadata
- ✅ Step 5: No regressions in known good titles
- ✅ Step 6: Error jobs monitored (result TBD tomorrow)

---

## Next Phase

**Phase D: Production Deployment**

Once Phase C verification complete:

```powershell
cd apps/ingest
pnpm build
npx wrangler deploy
```

This deploys:
- Schema fix (optional themes)
- Database cleanup endpoint
- All ingest workflow improvements

---

## Quick Reference: Environment Setup

**Windows PowerShell**:
```powershell
# Set tokens and URL
$env:INGEST_ADMIN_TOKEN = "your_token"
$env:INGEST_URL = "https://ingest.latino-canon.com"

# Verify
Write-Output "Token: $env:INGEST_ADMIN_TOKEN"
Write-Output "URL: $env:INGEST_URL"
```

**Bash/WSL**:
```bash
export INGEST_ADMIN_TOKEN="your_token"
export INGEST_URL="https://ingest.latino-canon.com"

echo "Token: $INGEST_ADMIN_TOKEN"
echo "URL: $INGEST_URL"
```

---

## Support

If any step fails:
1. Check error message carefully
2. Verify token is correct and set
3. Verify URL is correct
4. Check Cloudflare dashboard for worker logs
5. Review `PHASE_C_VERIFICATION.md` for detailed troubleshooting

---

**START HERE**: Set environment variables and run Step 1.
