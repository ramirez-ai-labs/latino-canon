# Operations & Monitoring

This project has no dashboard, no alerting, and no Analytics Engine wired up — that's
an honest gap, not an oversight to paper over (see [What's not here](#whats-not-here)).
What it does have is six real incidents that already happened in production, each
of which would have been caught in minutes by someone actually watching the right
signal instead of stumbling into it days later. This doc exists so the next person
(including future-you) doesn't have to rediscover the same failure modes by hand. The
one automated check that exists came out of incidents #4 and #5: a retrieval eval that
runs after every api deploy.

Read this before a big ingest batch, when `GET /search` looks wrong, or when
onboarding someone else to operate this project.

---

## The incidents this doc is built around

### 1. Blurb approval silently reset on every re-ingest

**What happened:** every blurb in the 219-title catalog was sitting at `approved:
false` — the live site was showing **zero** editorial "why it matters" blurbs to
real users, on the exact feature this project calls its core differentiator, for an
unknown period of time. Nobody noticed because nothing was watching approval count.

**Root cause:** `apps/ingest/src/persist.ts`'s `writeBlurb` unconditionally set
`approved = 0` on every `INSERT ... ON CONFLICT`, even when a re-ingest was for an
unrelated metadata fix (a wrong release year, a misclassified tag) that never
touched the blurb's actual text. A run of ordinary maintenance PRs quietly wiped
out an unknown amount of prior editorial review work as a side effect.

**How it was found:** not by monitoring — by manually running `pnpm eval:groundedness`
and getting "0 titles with approved blurbs" back, which prompted a spot-check
(`GET /titles/:id` on 15 titles spread across the catalog) that confirmed every one
had a real blurb sitting unapproved.

**Fix:** [PR #138](https://github.com/ramirez-ai-labs/latino-canon/pull/138) —
`approved` now only resets when `blurbs.text` or `blurbs.sources` actually change.

**What should have caught this sooner:** a scheduled check on `approved-title
count`. See [Alert: blurb approval count](#alert-blurb-approval-count).

### 2. Stuck ingest jobs behind a retry mechanism that doesn't retry

**What happened:** `Monarca (2019)` and `The Dead Girls (2025)` sat in the
`error` queue for two days after the bug that broke them (`themes` required but
sometimes absent from the classifier's output) was already fixed in a merged PR.
Separately, `El Chavo del Ocho` and `The Dead Girls` sat in `needs_review`
indefinitely even after they had real, confidence-1.0 seed-sourced tags — the
review queue was disagreeing with data sitting right next to it.

**Root cause, two layers:**
- `apps/ingest/src/maintenance.ts`'s `retryErroredJobs()` — the nightly cron job
  meant to recover errored ingests — only increments the `attempts` counter. It
  never actually reconstructs `IngestParams` and re-POSTs to the Workflow. It has
  always been a stub; nothing in the codebase actually calls it correctly.
- `apps/ingest/src/workflow.ts`'s `needs_review` gate checked only the model
  classifier's own confidence, never `seedInclusionTypes` — so a title with
  trusted, editor-provided tags could still get flagged for human review for no
  reason.

**Fix:** [PR #143](https://github.com/ramirez-ai-labs/latino-canon/pull/143) fixed
the review gate. [PR #152](https://github.com/ramirez-ai-labs/latino-canon/pull/152)
implemented `retryErroredJobs()` for real — it replays the exact `IngestParams`
stored on the job row at creation time (a new `ingest_jobs.params` column, migration
`0018`), never reconstructed from `title_ref` alone, since guessing those from
scratch is exactly what caused the third incident below. Jobs created before that
migration have no stored params and are deliberately left alone rather than
guessed at; `GET /jobs` still needs a human for those.

**A third, related incident from the same investigation:** re-ingesting El Chavo
del 8 surfaced that its seed entry's pinned `tmdbId` (1437) actually pointed at
*Firefly* (2002) — an unrelated title already in the catalog. Because nothing
validated a pinned ID against the title being ingested, a `force: true` re-ingest
silently overwrote Firefly's tags with El Chavo's. Fixed in
[PR #144](https://github.com/ramirez-ai-labs/latino-canon/pull/144), which also
added a same-title validation gate (release year within 2 years of what was
expected) so a wrong pinned ID now fails loudly instead of corrupting an unrelated
row.

**What should have caught this sooner:** `GET /jobs` needs to be checked
periodically, not only when something else prompts someone to look. See
[Alert: review queue age](#alert-review-queue-age).

### 3. The Workers AI neuron budget is account-wide, and ingestion can blow it

**What happened:** growing the catalog by ~85 titles in one session (plus a
~60-title `force: true` remediation re-ingest) burned **11.18k of the account's
10k daily neuron cap** on `classify`/`blurb` alone. That one pipeline was ~98% of
the day's entire usage. Once the cap was hit, `GET /search` — which calls Workers
AI on every request for query rewriting and semantic embedding — started erroring
for real users until the daily reset at 00:00 UTC. This wasn't a classification
problem anymore; it took down live search.

**Root cause:** the cap is per Cloudflare *account*, not per Worker or per
project — other Workers AI usage on the same account counts against the same
ceiling — and nothing tracks the running total across a day's ingest batches.
`apps/ingest/scripts/lib/post-titles.ts`'s `BATCH = 4` rate-limits a single run,
but not the cumulative total across many runs.

**Fix:** none shipped yet — the practical guidance (spread large batches across
more than one day, check current account-wide usage before a big batch) is
documented in the README's
["Free-tier budget"](../../README.md#the-workers-ai-neuron-budget-is-account-wide-and-ingestion-can-blow-it)
section but not enforced anywhere in code. See
[ROADMAP.md item #15](../ROADMAP.md).

**What should have caught this sooner:** a pre-batch neuron-usage check. See
[Alert: neuron budget](#alert-neuron-budget-headroom).

### 4. A Vectorize rebuild wiped the metadata every filtered search depends on

**What happened:** an api endpoint added to re-embed the catalog (`POST
/admin/rebuild-vectorize`, #211) upserted every vector with metadata `{title, year}`.
Vectorize replaces metadata on upsert, so `kind` and `decade` - the two fields
`filterToVectorize` pushes down - disappeared. Every semantic query with a `kind` or
`decade` filter returned 0 results. "animation films" (inferred `kind=film`) fell back to
an unfiltered keyword search for "films" and showed live-action dramas and a comedy
special. The endpoint was also unauthenticated.

**Root cause:** the embedding text and metadata were defined in three places (ingest, an
unused api helper, the rebuild endpoint), and they had drifted.

**Fix:** #213. One embedding contract in `packages/core/src/embedding.ts` used by every
writer; the api endpoint removed; a token-protected, paged `POST /rebuild-vectors` on the
ingest worker (`pnpm --filter @latino-canon/ingest rebuild:vectors`). The same PR fixed the
keyword index keeping stale text after a re-ingest (contentless FTS5) and its always-empty
`tags` column.

**What should have caught this sooner:** a filtered semantic spot-check (see the runbook
below) - and now the post-deploy retrieval eval.

**It came back once.** #222 re-added an unauthenticated `POST /admin/rebuild-vectorize` to
the public api worker - a duplicate of `/rebuild-vectors` that anyone could call in a loop
to spend the neuron budget live search runs on. Removed again; `apps/api/src/routes/
search.test.ts` now asserts the api exposes no `/admin` routes.

### 5. Inferred filters silently dropped search quality from 0.83 to 0.68

**What happened:** adding genre and content-advisory inference (#206) let the LLM query
rewrite emit 4-5 filters per query, each enforced as a hard `WHERE`. One wrong guess
excluded the right answer before ranking ran: `genre=Music` removed *In the Heights*
(TMDB: Drama, Romance), `kind=film` removed *Money Heist* (a series). Hybrid recall@5 fell
from 0.832 to 0.680; nothing noticed until a manual eval run.

**Fix:** #214 (filter-only queries list what matches; relax one filter at a time) and #215
(inferred filters re-rank instead of excluding) - back to 0.806. #219 made the retrieval
eval run after every api deploy and fail on a drop of more than 0.03.

### 6. The groundedness eval never saw its evidence

**What happened:** every published groundedness score (0.43-0.53, including the README's
0.486) measured nothing. Ingest stored each blurb source as `{kind, ref, quote: null}`
and the judge was given `quote ?? ref` - a title slug and a director's name, never the
synopsis. Claims copied from the synopsis scored 0.00. The judge also ran without a fixed
temperature, so identical inputs scored 0.525 and 0.431 two days apart.

**Fix:** #216 (sources store their id and text; the api resolves them; judge at temperature
0) and #217 (70B judge, claim-focused prompt). First valid baseline: 0.682. Old runs are
kept, labeled invalid, on the Eval page.

**What should have caught this sooner:** reading a handful of the judge's 0.00 verdicts
against the synopsis. An eval's inputs need checking as much as its outputs.

---

## Resource reference

| Resource | Name / ID |
|---|---|
| Cloudflare account | AI Builders Studio: LatinX (`d365fd06600fdb854f5874dc55977b09`) |
| `web` Worker | `latino-canon-web` |
| `api` Worker | `latino-canon-api` |
| `ingest` Worker | `latino-canon-ingest` |
| D1 database | `latino-canon` |
| Vectorize index | `latino-canon-titles` |
| R2 bucket | `latino-canon-posters` |
| KV cache namespace | `3cbc7e31b2de454db393f22775cc17ce` |
| AI Gateway | `latino-canon` |
| Live API | `https://latino-canon-api.ai-builders-studio-latinx.workers.dev` |
| Live web | `https://latino-canon-web.ai-builders-studio-latinx.workers.dev` |
| Live ingest admin | `https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev` (Bearer `INGEST_ADMIN_TOKEN`) |

Models in use (via `packages/core/src/llm.ts`'s `MODELS`):

| Task | Model |
|---|---|
| Query rewrite | `@cf/meta/llama-3.1-8b-instruct-fast` |
| Classify (inclusion types + themes) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Blurb generation | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Groundedness judge | `@cf/meta/llama-3.1-8b-instruct-fast` |
| Embeddings | `@cf/baai/bge-m3` (1024-dim, multilingual) |

`classify`/`blurb` run on the most expensive model here, twice per title — that's
why ingestion, not live search, is what actually burns through the neuron budget.

---

## AI Gateway

Every Workers AI call in this project routes through AI Gateway `latino-canon`
(`env.AI_GATEWAY_ID`), which sits in front of Workers AI for free and gives you,
per-request:

- Full prompt/response logs — useful for debugging a bad classification or blurb
  without needing to reproduce it locally.
- Cache hit/miss status.
- Latency and token counts per call.
- Cost/neuron attribution per model.

**Where to look:** Cloudflare dashboard → AI → AI Gateway → `latino-canon` →
Logs. Filter by model (`@cf/meta/llama-3.3-70b-instruct-fp8-fast` for the
expensive classify/blurb calls) when tracking down what actually burned the
budget on a given day.

## Neuron budget

- **10,000 neurons/day, free tier, resets 00:00 UTC.** Account-wide, not
  per-project.
- **Check current usage before a large ingest batch**, not after — this is the
  single practical lesson from incident #3 above. Cloudflare dashboard → AI →
  Workers AI shows today's usage so far (see the alert below for a CLI query).
- **Measured costs (2026-09-24, ingest re-measured 2026-09-25):** live search
  ~0.5–0.7k/day; the daily ingest queue ~3k (15 titles × ~200, 70B); groundedness eval ~2.8k per run (70B); retrieval eval ~0.15k hybrid /
  ~0.4k all modes.
- **Rules:** at most one 70B job (groundedness run, blurb regeneration) per day, never
  on an ingest day; sample before full runs; weekly, not nightly, schedules.
- `classify` and `blurb` (both on the 70B model) are the expensive calls, run
  twice per title during ingest. Query rewrite and embeddings (both on cheaper
  models, and embeddings only run once per title) are comparatively negligible.
- If the catalog's growth pace outgrows the free tier long-term, Workers AI's
  paid plan removes the daily cap — a deliberate cost decision to make
  explicitly, not something to back into by accident mid-incident.

## Observability queries: Curation Agent

`POST /agents/curate` (`apps/api/src/agents/`) emits one structured
`console.warn(JSON.stringify(...))` line per request, tagged `event:
"agents.curate"`, with an `outcome` field (`completed` | `error` | `cache_hit` |
`rate_limited` | `budget_exhausted`) and, on `completed`/`error`, per-step
`timings` (`intentMs`/`searchMs`/`toneMs`/`rerankMs`/`totalMs`) plus the
extracted intent (`source`/`theme`/`decade`/`directorGender`/`tone`). Cloudflare
Workers Logs parses `console` output as structured fields when it's valid
JSON, which is what actually makes a request queryable later - the
human-readable `reasoning` array in the API response only ever reaches whoever
called the endpoint for that one request.

**Not a Custom Dashboard** - corrected after actually checking Cloudflare's own
docs, having gotten this wrong twice already: Custom Dashboards (Observe ->
Analytics) only cover GraphQL analytics datasets (standard Workers metrics -
requests, errors, CPU time) and Log Explorer datasets, and Workers Logs custom
fields (`event`, `outcome`, `timings.totalMs`, `source`) aren't in Log
Explorer's [supported dataset
list](https://developers.cloudflare.com/log-explorer/manage-datasets/#supported-datasets)
at all. The tool that actually supports filtering/grouping/visualizing a
Worker's own custom log fields is the **Workers Observability Query Builder** -
a different feature, and it produces individually saved queries, not one
unified multi-widget dashboard.

**Seed data before building queries** - the field picker needs a field to have
appeared in at least one log line before it'll offer it:

```bash
AGENT_URL=https://latino-canon-api.<acct>.workers.dev \
  pnpm --filter @latino-canon/api exec ./scripts/seed-agent-logs.sh
```

Fires 12 distinct queries in a burst - 10 land `completed`, the last 2 trip the
per-IP rate limit and land `rate_limited`, giving every outcome except
`budget_exhausted` (a 200/day account-wide cap, not worth actually burning just
to seed a chart) real data to query against.

**Build it**: `latino-canon-api` -> **Observability** -> **Query Builder** (the
plain Events/Query Builder page, not Observe -> Analytics -> Custom
Dashboards). For each row below: set the filter, pick the visualization, add
the group-by field, **Run**, then **Save** - one saved query per row, viewed
individually rather than as widgets on one page.

| Saved query | Visualization | Filter (in addition to `event = "agents.curate"`) | Group by | Watching for |
|---|---|---|---|---|
| Requests over time | Time series | none | time bucket | Traffic pattern - spikes during a demo, quiet otherwise |
| Outcome breakdown | Pie / stacked bar | none | `outcome` | Split across all five outcomes - a wall of `rate_limited`/`budget_exhausted` means the guards are actually firing |
| p95 latency | Single stat / time series | `outcome = "completed"` | none | `timings.totalMs` - the real "is this demo-fast" number |
| Step latency breakdown | Bar chart, 3 series | `outcome = "completed"` | none | Avg of `timings.intentMs`, `timings.searchMs`, `timings.toneMs` side by side - identifies the bottleneck if p95 looks bad (almost certainly `searchMs`, the one hitting D1 + Vectorize) |
| Intent source | Pie | `outcome = "completed"` | `source` | `rules` vs `llm` vs `none` - how often intent extraction actually skips the AI call |

If the field picker doesn't offer a nested path like `timings.totalMs`
directly, check one raw log entry in the plain **Logs** view first to see
exactly how Cloudflare flattened the JSON - the picker's field name should
match whatever that shows.

## What's not here

Being direct about this rather than implying more observability exists than
actually does:

- **No Cloudflare Analytics Engine.** Request-pattern and error-rate querying
  would need this wired up; right now it isn't. If this project outgrows manual
  checks, this is the next real investment, not a dashboard that already exists
  and just needs a link.
- **No alerting**, with one exception: `eval-retrieval.yml` runs after every api
  deploy and fails (a red run on the commit) when hybrid recall@5 drops more than
  0.03. It checks search quality, not uptime or errors. Every "alert" below is a manual
  check someone has to remember to run. There is no PagerDuty/email/Slack hook anywhere in this
  stack.
- **No uptime monitoring.** Nothing pings the live endpoints on a schedule.
- **No quota alerting beyond Cloudflare's own account-level emails** (KV, D1,
  Workers AI neurons) — the same "someone has to see the email" gap as incident
  #3's neuron budget, just for other resources. Nothing in this codebase watches
  usage proactively.

---

## Manual checks ("alerts" until real alerting exists)

Run these periodically, and always before/after a large ingest batch. None of
this is automated — that's the honest state, not a design choice.

### Alert: neuron budget headroom

Dashboard: **Cloudflare dashboard → AI → Workers AI** shows "Neurons used today". Or
per day and model from the CLI, using wrangler's login (after `npx wrangler whoami`):

```bash
TOKEN=$(grep -m1 '^oauth_token' ~/Library/Preferences/.wrangler/config/default.toml | cut -d'"' -f2)
curl -s https://api.cloudflare.com/client/v4/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{viewer{accounts(filter:{accountTag:\"<ACCOUNT_ID>\"}){aiInferenceAdaptiveGroups(limit:100,filter:{date_geq:\"2026-09-20\"},orderBy:[date_ASC]){dimensions{date modelId}sum{totalNeurons}}}}}"}'
```
 Check before starting any batch larger than a
handful of titles. If same-day
usage from other sources is already high, spread the batch across more than one
day (incident #3).

### Alert: review queue age

```bash
curl -s https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/jobs \
  -H "authorization: Bearer $INGEST_ADMIN_TOKEN" | python3 -m json.tool
```

Returns everything in `needs_review` or `error`. Anything with an `updated_at`
more than a few days old is stuck — the retry cron will not fix it (incident #2).
For an `error` job, check whether the underlying bug is already fixed in current
code before blindly re-running it; if so, re-`POST /ingest` with `force: true`
and the *complete* original params (including `seedInclusionTypes` and any
pinned `tmdbId` — reconstructing an incomplete payload by hand is exactly what
caused the Firefly cross-contamination in incident #2).

### Alert: ingest queue held entries

```bash
curl -s https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/queue \
  -H "authorization: Bearer $INGEST_ADMIN_TOKEN" | python3 -m json.tool
```

`next` is what the 08:00 UTC cron will start, `eligible` the whole backlog (it should
fall by `INGEST_QUEUE_PER_DAY`, 15, each day). Anything in `held` needs a human: the
seed's current pin already failed (check `GET /jobs`), or a job finished but no live
title has that `tmdbId` (a slug collision). The fix is a corrected pin in the seed, not
a retry - the nightly retry skips jobs the seed has since re-pinned.

### Alert: blurb approval count

```bash
npx wrangler d1 execute latino-canon --remote --command \
  "SELECT approved, COUNT(*) FROM blurbs GROUP BY approved"
```

If `approved = 1` count doesn't grow roughly in line with the catalog, or drops
between checks, something is silently un-approving blurbs again (incident #1).
Cross-check against `GET /titles?hasBlurb=1`'s count, which is what the live
site's search results actually gate on.

### Alert: search latency / error rate

Latency and errors have no automated tracking; ranking quality does (the post-deploy
retrieval eval - check its latest run under **Actions → Run retrieval eval**, or the Eval
page). Spot-check latency:

```bash
curl -s -w "\n%{http_code} %{time_total}s\n" \
  "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/search?q=family&mode=hybrid" \
  -o /dev/null
```

See [Performance targets](#performance-targets) for what "normal" looks like.

---

## Incident response runbook

### `GET /search` is erroring or returning empty results

1. Check neuron budget first (incident #3's exact symptom — search calls Workers
   AI on every request for query rewrite + embedding). If exhausted, nothing
   fixes this except waiting for the 00:00 UTC reset, or upgrading to paid.
2. Check whether it's mode-specific. `&mode=lexical` doesn't need Workers AI to
   succeed (the query rewrite falls back to keyword rules when the LLM call fails);
   `&mode=semantic`/`&mode=hybrid` need the query embedding. If only lexical works,
   it's almost certainly the neuron budget.
3. Empty or wrong results **only when a filter applies**? Check the vector metadata
   (incident #4): `?q=coco&mode=semantic&kind=film` must return Coco. If it returns
   nothing, re-embed with `pnpm --filter @latino-canon/ingest rebuild:vectors`, then
   `POST /rebuild-search-cache`.
4. Results look worse after a deploy? Check the latest **Run retrieval eval** run
   (incident #5) - its per-category table shows which kind of query regressed.
5. Check AI Gateway logs for the actual error Workers AI returned.
6. Check D1 directly (`wrangler d1 execute latino-canon --remote --command
   "SELECT 1"`) to rule out a D1-side outage.

### An ingest job is stuck in `error`

1. Read the stored `error` message via `GET /jobs` — don't assume it's still
   accurate. Incident #2 was two jobs stuck on a bug that was already fixed days
   earlier.
2. Check whether the failing code path has already been patched on `main` since
   the job last ran.
3. If fixed: re-`POST /ingest` with the **complete** original params from
   `apps/ingest/src/seed/canon.seed.json` (title, year, kind, `tmdbId` if
   pinned, `seedInclusionTypes`) and `force: true`. Don't reconstruct params
   from memory or guesswork — that's exactly what caused incident #2's Firefly
   cross-contamination.
4. If a `tmdbId` is pinned, verify it actually resolves to the right title
   first (`https://api.themoviedb.org/3/tv/{id}` or `/movie/{id}`) — don't
   trust the seed file blindly; it has been wrong before.

### A title is stuck in `needs_review`

This is not necessarily a bug — it's the confidence gate working as designed
when the classifier genuinely can't confidently assign a tag. Check whether the
title has `seedInclusionTypes` in the seed file first: if it does and it's still
in `needs_review`, that's the incident #2 bug (already fixed in
[PR #143](https://github.com/ramirez-ai-labs/latino-canon/pull/143) — confirm
the ingest Worker has actually deployed that fix). If it doesn't have seed tags,
resolving it is an editorial call: a human decides the correct tag(s) and
inserts them with `source = 'editor'` directly via D1 (there is no approval
endpoint for this queue, same gap as blurb approval).

### Blurb approval count looks wrong

Confirm whether it's genuinely zero/dropping (incident #1's bug — check that
[PR #138](https://github.com/ramirez-ai-labs/latino-canon/pull/138) is deployed)
or just hasn't grown because nothing new has been reviewed. New ingests always
start at `approved = 0` by design; that's not the bug. The bug is an
*already-approved* blurb losing approval on an unrelated re-ingest.

---

## Performance targets

Informal — nothing here is an enforced SLA, no automated tracking exists, and
these are numbers actually observed rather than aspirational ones:

| Metric | Observed | Notes |
|---|---|---|
| `GET /search` (hybrid, cache miss) | ~300–1000ms | Includes a Workers AI round-trip for query rewrite + embedding |
| `GET /search` (cache hit) | <50ms | KV-cached; TTL via `SEARCH_CACHE_TTL_SECONDS` |
| `GET /titles/:id` | <100ms | Pure D1 read |
| Ingest workflow (per title, full pipeline) | ~10–30s | resolve → fetch → normalize → persist → classify → embed → blurb |
| Groundedness eval (full catalog) | ~2 min for 216 titles | One judge call per title |

If search latency climbs well past the hybrid-cache-miss range above with no
corresponding change in query complexity, check the neuron budget and AI
Gateway logs before assuming it's a code regression.
