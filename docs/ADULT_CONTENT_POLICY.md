# Adult Content Exclusion Policy

**Effective Date:** 2026-09-17  
**Status:** CRITICAL SAFEGUARD

---

## Policy Statement

**Latino Canon explicitly excludes adult/pornographic content.** This applies to:
- Films marked as adult on TMDB (`adult=true`)
- Content primarily sexual or pornographic in nature
- Erotic films marketed as adult entertainment

---

## Implementation

### 1. TMDB Adult Flag (Automatic)
All films fetched from TMDB are checked for the `adult` boolean flag:
- **TMDB adult=true** → Automatically skipped during ingest
- **Error status:** `"Content flagged as adult (TMDB adult=true); excluded per curation policy"`

**Location:** `apps/ingest/src/workflow.ts` (line ~45)

### 2. Classifier Safeguard (LLM Gate)
The classification prompt explicitly rejects adult content:
- If synopsis/cast/title suggests sexual content → returns empty `inclusionTypes[]`
- LLM applies judgment even if TMDB flag is missed
- Classifier note: `"Adult content excluded per curation policy"`

**Location:** `packages/core/src/prompts.ts` (line 38, CLASSIFY_SYSTEM)

### 3. Validation in Tag Writing
The `writeTags()` function validates that every title has ≥1 valid inclusion_type:
- No inclusion_type = film is skipped (prevents adult films with no tags)
- Logged as warning if attempted

**Location:** `apps/ingest/src/persist.ts` (line ~85, writeTags)

---

## Escalation

If pornographic content slips through:

1. **Immediate:** Remove via SQL (do NOT wait for PR merge)
   ```bash
   wrangler d1 execute latino-canon --remote << 'EOF'
   DELETE FROM titles WHERE title = 'Film Name';
   EOF
   ```

2. **Document:** Add to CANON_TRACKING_MASTER.csv with reason:
   ```
   "Title","Year","Director","Country","Status","Source","In Canon","Reason"
   "Film","Year","Dir","Country","❌ EXCLUDED","","NO (Removed)","Adult content - pornographic film"
   ```

3. **Post-Mortem:** Review which gate failed (TMDB? Classifier? Tag validation?)

---

## Testing

To verify the gates work:

```sql
-- Verify no films with adult=true are in titles table
SELECT COUNT(*) FROM titles WHERE adult=true;
-- Expected: 0

-- Check ingest_jobs for rejected adult content
SELECT title_ref, error FROM ingest_jobs 
WHERE error LIKE '%adult%' 
ORDER BY updated_at DESC LIMIT 10;
```

---

## Known Gaps Closed (2026-09-17 Incident)

**The Chase (1996)** and **Devon: Decadence (2005)** were pornographic films that slipped through earlier and required manual deletion. Closed by:

1. ✅ TMDB adult flag check (workflow gate)
2. ✅ Classifier prompt safeguard (LLM gate)
3. ✅ Tag validation (no empty inclusion_types)

This incident revealed that **TMDB's adult flag is not 100% reliable** — it depends on community curation. The LLM gate provides a secondary defense.

---

## Review Cadence

- **Weekly:** Check `ingest_jobs` for "adult content excluded" errors
- **Monthly:** Spot-check recent titles manually against synopsis
- **Quarterly:** Review policy effectiveness

---

**Owner:** Victor Ramirez  
**Last Updated:** 2026-09-17
