#!/bin/bash
set -e

# Phase C Verification Script
# Automates verification and error recovery after seed/database cleanup

INGEST_URL="${INGEST_URL:-https://ingest.latino-canon.com}"
INGEST_ADMIN_TOKEN="${INGEST_ADMIN_TOKEN}"

if [ -z "$INGEST_ADMIN_TOKEN" ]; then
  echo "❌ Error: INGEST_ADMIN_TOKEN not set"
  echo "Usage: INGEST_ADMIN_TOKEN=your_token ./phase-c-verify.sh"
  exit 1
fi

echo "🚀 Phase C: Verification & Error Recovery"
echo "================================================"
echo ""

# Step 1: Database Cleanup Verification
echo "📊 Step 1: Verifying Database Cleanup"
echo "---"

read -p "Have you merged PR #112? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "⚠️  Skipping cleanup verification (merge PR #112 first)"
else
  echo "Executing cleanup endpoint..."
  CLEANUP_RESPONSE=$(curl -s -X POST "$INGEST_URL/cleanup/remove-invalid-tmdb" \
    -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
    -H "Content-Type: application/json")

  echo "$CLEANUP_RESPONSE" | jq '.'

  # Check if cleanup succeeded
  if echo "$CLEANUP_RESPONSE" | jq -e '.status == "success"' > /dev/null 2>&1; then
    echo "✅ Database cleanup completed successfully"

    # Verify counts
    VERIFIED=$(echo "$CLEANUP_RESPONSE" | jq '.verified | to_entries | map(select(.value != 0)) | length')
    if [ "$VERIFIED" -eq 0 ]; then
      echo "✅ All orphaned records deleted (verified counts = 0)"
    else
      echo "⚠️  Warning: Some records may not have been fully deleted"
      echo "$CLEANUP_RESPONSE" | jq '.verified'
    fi
  else
    echo "❌ Cleanup failed"
    exit 1
  fi
fi

echo ""
echo "🔄 Step 2: Re-ingest El Chavo del 8"
echo "---"

read -p "Re-ingest El Chavo del 8 via workflow? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Triggering workflow ingest for El Chavo del 8..."

  INGEST_RESPONSE=$(curl -s -X POST "$INGEST_URL/ingest" \
    -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "titles": [
        {
          "ref": "El Chavo del 8 (1973)",
          "title": "El Chavo del 8",
          "year": 1973,
          "kind": "series",
          "tmdbId": 1437,
          "seedInclusionTypes": ["led_by", "created_by", "about_community", "breakthrough"],
          "force": true
        }
      ]
    }')

  echo "$INGEST_RESPONSE" | jq '.'

  if echo "$INGEST_RESPONSE" | jq -e '.started | length > 0' > /dev/null 2>&1; then
    JOB_ID=$(echo "$INGEST_RESPONSE" | jq -r '.started[0]')
    echo "✅ Workflow started: $JOB_ID"
    echo "⏳ Workflow is processing... check /jobs endpoint in a few seconds"
  else
    echo "❌ Failed to start workflow"
  fi
fi

echo ""
echo "📋 Step 3: Check Ingest Job Status"
echo "---"

read -p "Check job status? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Fetching all ingest jobs..."

  JOBS_RESPONSE=$(curl -s -X GET "$INGEST_URL/jobs" \
    -H "Authorization: Bearer $INGEST_ADMIN_TOKEN")

  echo "$JOBS_RESPONSE" | jq '.jobs'

  echo ""
  echo "Summary:"
  NEEDS_REVIEW=$(echo "$JOBS_RESPONSE" | jq '[.jobs[] | select(.status == "needs_review")] | length')
  ERRORS=$(echo "$JOBS_RESPONSE" | jq '[.jobs[] | select(.status == "error")] | length')
  DONE=$(echo "$JOBS_RESPONSE" | jq '[.jobs[] | select(.status == "done")] | length')

  echo "  Needs Review: $NEEDS_REVIEW"
  echo "  Errors: $ERRORS"
  echo "  Done: $DONE"

  if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo "⚠️  Error jobs detected. These will be retried by nightly cron."
    echo "   Check again after 8 AM UTC for cron retry results."
  fi
fi

echo ""
echo "📱 Step 4: Manual UI Verification"
echo "---"
echo ""
echo "Search your UI for:"
echo "  ✓ 'El Chavo' — should show full metadata + poster"
echo "  ✓ 'Monarca' — verify complete classification"
echo "  ✓ 'The Dead Girls' — verify complete classification"
echo "  ✓ 'Coco' — regression test (should work normally)"
echo ""

echo "================================================"
echo "✅ Phase C verification complete!"
echo ""
echo "Next steps:"
echo "  1. Verify UI shows all titles correctly"
echo "  2. Check error jobs after nightly cron (8 AM UTC)"
echo "  3. Deploy Phase D: pnpm build && npx wrangler deploy"
echo ""
