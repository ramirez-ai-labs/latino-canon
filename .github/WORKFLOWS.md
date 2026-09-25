# GitHub Actions Workflows

All workflows are organized by category below. Each entry includes the trigger condition and purpose.

## CI/CD Validation (Automatic on PR)

### validate-pr.yml
- **Trigger**: On every pull request to `main`
- **Purpose**: Gate all PRs with type checking, tests, and build validation
- **What it does**:
  - Typechecks all packages (web, api, core, eval, ingest)
  - Runs test suites
  - Validates Next.js OpenNext build
  - Cancels previous concurrent runs
- **Duration**: ~2-3 minutes
- **Must pass before merge**: YES

### pr-labels.yml
- **Trigger**: On PR open/update to `main`
- **Purpose**: Auto-label PRs by changed paths for organization
- **What it does**:
  - Applies labels: web, api, ingest, core, evaluation, infrastructure, documentation, github_actions
- **Duration**: ~10 seconds
- **Critical**: NO (informational only)

---

## Deployments (Automatic on main commit)

### deploy-api.yml
- **Trigger**: On commit to `main` + changes to `apps/api/**`
- **Purpose**: Deploy API Worker to production
- **What it does**:
  - Deploys Hono router + hybrid search to Cloudflare Workers
  - Auto-applies pending D1 migrations (continues on failure)
  - Binds to: D1 (latino-canon), Vectorize, R2, KV, AI Gateway
- **Duration**: ~30 seconds
- **Requires**: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID

### deploy-ingest.yml
- **Trigger**: On commit to `main` + changes to `apps/ingest/**`
- **Purpose**: Deploy ingest Worker + cron jobs to production
- **What it does**:
  - Deploys Workflow orchestration engine
  - Configures nightly cron (8 AM UTC): retryErroredJobs, refreshPopularity
  - Binds to: D1, Vectorize, R2, AI binding, AI Gateway
- **Duration**: ~30 seconds
- **Requires**: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID

### deploy-web.yml
- **Trigger**: On commit to `main` + changes to `apps/web/**`
- **Purpose**: Deploy Next.js frontend to Cloudflare Pages
- **What it does**:
  - Builds Next.js 15 with OpenNext
  - Deploys to Cloudflare Pages (static + API routes)
  - Auto-invalidates cache on deployment
- **Duration**: ~2 minutes
- **Requires**: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID

---

## Data Ingestion

Merged seed titles are **not** ingested by a workflow. The ingest worker's daily cron
(08:00 UTC) runs the ingest queue (`apps/ingest/src/ingest-queue.ts`): the next
`INGEST_QUEUE_PER_DAY` (default 5) pinned seed entries whose TMDB id isn't live.
`GET /queue` on the ingest worker previews it.

### ingest-new-titles.yml
- **Trigger**: manual only (`workflow_dispatch`, optional `base_ref`)
- **Purpose**: override - ingest titles added since `base_ref` immediately, outside the queue
- **Note**: spends 70B neurons now; check the day's budget first

---

## Evaluation

### eval-retrieval.yml
- **Trigger**: automatically after every successful `deploy-api` run on `main` (`workflow_run`);
  weekly on Sundays 09:30 UTC; manual (`workflow_dispatch`, choose modes)
- **Purpose**: post-deploy regression check for search quality
- **What it does**:
  - Runs the 77-query golden set (`packages/eval/src/datasets/queries.jsonl`) against the live api:
    hybrid only after a deploy, all three modes weekly
  - Reports recall@5 / recall@10 / MRR / nDCG@10, overall and per query type
    (known-item, person, plot, facet, spanish)
  - Records the run in D1 (`eval_runs`), including when it fails
  - **Fails** when hybrid recall@5 drops more than 0.03 against the last *passing* run on the
    same golden set (a failed run never becomes the baseline)
- **Limit**: checks a deploy after it's live; it can't block it
- **Duration**: ~1-2 minutes
- **Requires**: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
- **Cost**: ~0.15k Workers AI neurons (hybrid) / ~0.4k (all modes), measured

### eval-groundedness.yml
- **Trigger**: Manual (`workflow_dispatch` from GitHub Actions UI)
- **Purpose**: Run blurb groundedness evaluation against live catalog
- **What it does**:
  - Enumerates all titles with approved blurbs via `GET /titles?hasBlurb=1`
  - Calls the 70B Workers AI judge for each blurb, with each source's real text (judge v3)
  - Records metrics + scores in D1 (eval_runs table)
  - Uploads results to GitHub Actions artifacts
  - Displays results at `/eval` page on website
- **Duration**: ~2-3 minutes (depending on blurb count)
- **Requires**: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
- **Cost**: ~2.8k Workers AI neurons per full run (~13 per blurb, 70B), measured. Run at
  most once a day and never on an ingest day
- **How to run**:
  1. Go to GitHub Actions tab
  2. Select "Run groundedness eval"
  3. Click "Run workflow"

---

## Release (Manual trigger)

### release.yml
- **Trigger**: Manual (`workflow_dispatch` from GitHub Actions UI)
- **Purpose**: Create semantic version release + git tag
- **What it does**:
  - Bumps version in `package.json` (options: major, minor, patch)
  - Creates git tag (e.g., `latino-canon-v0.3.1`)
  - Generates release notes from PR titles since last tag
  - Creates GitHub Release
- **Duration**: ~1 minute
- **How to run**:
  1. Go to GitHub Actions tab
  2. Select "Release"
  3. Click "Run workflow"
  4. Choose version bump (major/minor/patch)

---

## Workflow Decision Matrix

| When | What runs | Automatic | Manual | Purpose |
|------|-----------|-----------|--------|---------|
| PR opened | validate-pr, pr-labels | ✅ | — | Gate quality |
| Commit to main + api changes | deploy-api | ✅ | — | Deploy API |
| Commit to main + ingest changes | deploy-ingest | ✅ | — | Deploy ingest |
| Commit to main + web changes | deploy-web | ✅ | — | Deploy frontend |
| Daily 08:00 UTC (ingest worker cron) | ingest queue, 5 titles | ✅ | — | Ingest data |
| Manual trigger from Actions UI | ingest-new-titles | — | ✅ | Ingest now (override) |
| deploy-api succeeds | eval-retrieval (hybrid) | ✅ | — | Catch search regressions |
| Sundays 09:30 UTC | eval-retrieval (all modes) | ✅ | ✅ | Weekly search baseline |
| Manual trigger from Actions UI | eval-groundedness | — | ✅ | Evaluate blurbs |
| Manual trigger from Actions UI | release | — | ✅ | Cut release |

---

## Troubleshooting

### "My PR validation is failing"
→ Check `validate-pr` logs for typecheck, test, or build errors

### "My deployment didn't go through"
→ Check `deploy-*` logs for Cloudflare token or migration errors

### "New titles didn't appear in search"
→ Titles ingest via the daily queue, 5 a day. Check `GET /queue` on the ingest worker
for the order and any held entries, then `GET /jobs` for errors

### "Eval results aren't showing on /eval page"
→ Check the `eval-retrieval` / `eval-groundedness` logs for D1 insert errors

### "The retrieval eval failed after my deploy"
→ Open the run: the per-category table and the "hybrid misses" list show which queries
dropped out of the top 5. See incident #5 in `docs/operations/monitoring.md`.

### "Which workflows trigger on my commit?"
→ Use the Decision Matrix above; only PRs trigger CI gates

---

## Adding a New Workflow

When adding a workflow:
1. Follow naming convention: `{type}-{purpose}.yml` (e.g., `deploy-api.yml`, `eval-groundedness.yml`)
2. Add it to the appropriate section above
3. Document: trigger, purpose, duration, requirements
4. Test locally with `act` if critical

---

## Suggested Future Organization

GitHub Actions doesn't have built-in workflow grouping, but we can improve discoverability by:

1. **Prefixes in workflow names** (currently using, but not in GitHub UI):
   - `ci-*` for validation workflows
   - `deploy-*` for deployment workflows
   - `eval-*` for evaluation workflows
   - `release-*` for release workflows
   - `ingest-*` for data workflows

2. **Documentation** (this file) as the single source of truth

3. **Consistent naming** makes manual sorting/filtering easier
