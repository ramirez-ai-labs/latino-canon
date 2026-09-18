# Database Cleanup: Invalid TMDB Entries

## Overview

Removes orphaned database records for 13 titles with invalid/non-existent TMDB IDs that were removed from `canon.seed.json` in PR #111.

## Scope: 13 Removed Titles

These titles had TMDB 404 errors during ingest and are no longer in the seed:

1. The Offended (2016)
2. Últimos días en La Habana (2016)
3. El Amparo (2016)
4. The Movie of My Life (2017)
5. A Wolf at the Door (2013)
6. The Thin Yellow Line (2015)
7. The Boy and the World (2013)
8. The Golden Dream (2013)
9. The Liberator (2013)
10. The Delay (2012)
11. Tattoo (2013)
12. Elite Squad 2: The Enemy Within (2010)
13. Love for Sale (2006)

## Database Impact

Deletes records from 6 tables (in dependency order to respect FK constraints):

| Table | Records Deleted | Reason |
|-------|-----------------|--------|
| `ingest_jobs` | ~13 | Job records for the 13 titles |
| `blurbs` | ~13 | Unapproved blurbs for the 13 titles |
| `title_tags` | Variable | Inclusion type & theme tags |
| `credits` | Variable | Director/writer/cast credits |
| `people` | Variable | Orphaned people (if no other credits) |
| `titles` | 13 | The title records themselves |

## How to Execute

### Option 1: API Endpoint (Preferred)

```bash
curl -X POST https://ingest.your-domain/cleanup/remove-invalid-tmdb \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

Response:
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

### Option 2: SQL Directly (Manual)

Run `remove-invalid-tmdb-entries.sql` via Cloudflare D1 dashboard.

## Verification

The cleanup function returns `verified` counts — these should all be **0** if successful.

If any verified count is > 0, records were not fully deleted:
- Check FK constraints
- Verify title slug IDs match the cleanup list
- Rerun the cleanup endpoint

## Files

- `index.ts` — TypeScript cleanup function with parameterized SQL queries
- `remove-invalid-tmdb-entries.sql` — Raw SQL cleanup script (for reference/manual execution)
- `README.md` — This file

## Notes

- **Non-destructive seed-only change**: Seed cleanup (PR #111) prevents future ingestions of these titles
- **Database cleanup**: This (PR #112) removes existing bad records from the database
- **Cascading deletes**: `people` table is cleaned via LEFT JOIN to avoid orphaned person records
- **Idempotent**: Running cleanup multiple times is safe — no errors if records don't exist
