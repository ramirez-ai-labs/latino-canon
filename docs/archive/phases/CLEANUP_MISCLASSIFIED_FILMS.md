# Cleanup: Misclassified Films Removed

**Date:** 2026-09-17  
**Branch:** `fix/remove-misclassified-films`  
**Issue:** Classifier incorrectly tagged 14 non-Latino films as part of canon during earlier ingest runs

---

## Films Removed

These films **do not meet any Latino Canon criteria** and should never have been ingested:

| Title | Year | Reason |
|-------|------|--------|
| Aimée | 1981 | French film; no Latino connection |
| Black Swan: Metamorphosis | — | Non-Latino documentary |
| Mallepuvvu | — | Non-Latino subject matter |
| My Kingdom | — | Non-Latino subject matter |
| Kingdom of Saturn: Cassini's Epic Quest | — | NASA space documentary |
| A Place to Grow | — | Non-Latino subject matter |
| Creedance Clearwater Revival: Travelin' Band | — | US rock music documentary |
| 1+8 | — | Unclear/unrelated |
| Miroslav Vitous: Live in Vienna | — | Jazz music performance (non-Latino musician) |
| Bebe Mais: Bichos | — | Non-Latino subject |
| Paste Makes Waste | — | Non-Latino subject |
| Cinema16: European Short Films (Special US Edition) | — | European short films anthology |
| The Chase | — | Non-Latino subject |
| Devon: Decadence | — | Non-Latino subject |

---

## Root Cause

**Classifier error:** The LLM classifier was too permissive and tagged films with no:
- `led_by` (Latino director/creator)
- `created_by` (Latino writer)
- `about_community` (Latino subject/centering)
- `breakthrough` (representation/award milestone)

**Action:** Added validation gate in `persist.ts` to prevent future ingests without valid inclusion_type.

---

## Verification

Run after deployment:
```sql
SELECT COUNT(*) as total_titles FROM titles;
-- Expected: Previous count - 14 = new baseline
```

---

## Prevention

Updated `apps/ingest/src/persist.ts` to skip any title that fails to get a valid `inclusion_type` tag from the classifier. This prevents malformed records from entering D1.
