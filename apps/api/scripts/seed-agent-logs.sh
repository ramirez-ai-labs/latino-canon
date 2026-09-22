#!/bin/bash
# Fires a burst of requests at POST /agents/curate so a fresh Cloudflare Custom
# Dashboard has real data to build panels against - Cloudflare's dashboard builder
# needs a field to have actually appeared in at least one log line before you can
# filter/group on it.
#
# 12 *distinct* queries (not the same one repeated - a repeat hits the KV cache,
# which is checked before the per-IP rate limit in routes/agents.ts, so it would
# never actually trigger rate_limited) in one quick burst: the first 10 land as
# "completed" within the 10/min per-IP window (RATE_LIMIT_PER_MINUTE), the last 2
# push past it and land as "rate_limited". Not attempting budget_exhausted here -
# that's a 200/day account-wide cap, not worth actually burning to seed one chart.
#
#   AGENT_URL=https://latino-canon-api.<acct>.workers.dev ./scripts/seed-agent-logs.sh
set -euo pipefail

URL="${AGENT_URL:-http://localhost:8787}"

echo "Firing 12 distinct queries in quick succession (expect 10 completed, 2 rate_limited)..."
for i in $(seq 1 12); do
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${URL}/agents/curate" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"seed dashboard test query ${i}, something lighter from the 90s directed by women\"}")
  echo "  [$i] status $status"
done

echo "Done. Check Workers & Pages -> latino-canon-api -> Observability -> Logs for event=agents.curate lines before building dashboard panels against these fields."
