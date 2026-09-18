# Fix: Schema Rebuild & Redeploy

**Issue**: Monarca and The Dead Girls classification failing with "themes is required" error

**Root Cause**: 
- Schema was updated to make `themes` optional (PR #108 fix)
- But deployed worker had cached/stale version of schema from core package
- LLM returns responses without themes field
- Stale schema validation rejects undefined themes as invalid

**Solution**:
- Redeploy worker with fresh build to force schema rebuild
- Ensure packages/core schema is bundled with updated `.optional()` modifier

---

## Timeline

1. **Identified**: Schema fix present in packages/core/src/schema.ts (line 65: `.optional()`)
2. **Root cause**: Deployed worker using cached/older version of core schema
3. **Fix**: Full rebuild + redeploy (forces core package rebuild)
4. **Expected result**: Monarca & The Dead Girls should pass classification step

---

## Verification

After redeploy, error jobs should:
- Retry via nightly cron (8 AM UTC)
- Pass classification step (themes now optional)
- Move to `done` or `needs_review` status

---

## Files Affected

- `packages/core/src/schema.ts` (line 65) — `.optional()` already present
- Worker binary (fresh build with updated core)

---

## PR Details

Branch: `fix/schema-rebuild-deploy`  
Change: Force rebuild & redeploy with updated schema  
Status: Redeploying (in progress)
