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

## Data Ingestion (Manual trigger or on seed commit)

### ingest-new-titles.yml
- **Trigger**: On commit to `main` + changes to `apps/ingest/src/seed/canon.seed.json`
- **Purpose**: Ingest new titles from seed into production database
- **What it does**:
  - Detects new titles added to seed file
  - POSTs them to `/ingest` endpoint for full workflow processing
  - Runs 4 titles at a time with 5s delays
- **Duration**: Varies (1-5 min depending on batch size)
- **Note**: Runs in parallel with `deploy-ingest.yml` — no ordering guarantee

---

## Evaluation (Manual trigger)

### eval-groundedness.yml
- **Trigger**: Manual (`workflow_dispatch` from GitHub Actions UI)
- **Purpose**: Run blurb groundedness evaluation against live catalog
- **What it does**:
  - Enumerates all titles with approved blurbs via `GET /titles?hasBlurb=1`
  - Calls Workers AI REST API judge for each blurb
  - Records metrics + scores in D1 (eval_runs table)
  - Uploads results to GitHub Actions artifacts
  - Displays results at `/eval` page on website
- **Duration**: ~2-3 minutes (depending on blurb count)
- **Requires**: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
- **Cost**: ~2 neurons per title (Workers AI billing)
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
| Commit to main + seed.json changes | ingest-new-titles | ✅ | — | Ingest data |
| Manual trigger from Actions UI | eval-groundedness | — | ✅ | Evaluate blurbs |
| Manual trigger from Actions UI | release | — | ✅ | Cut release |

---

## Troubleshooting

### "My PR validation is failing"
→ Check `validate-pr` logs for typecheck, test, or build errors

### "My deployment didn't go through"
→ Check `deploy-*` logs for Cloudflare token or migration errors

### "New titles didn't appear in search"
→ Check `ingest-new-titles` logs; seeds are ingested async via workflow

### "Eval results aren't showing on /eval page"
→ Check `eval-groundedness` logs for D1 insert errors

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
