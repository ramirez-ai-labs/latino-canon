# Main Branch Protection Rules Setup

This document provides step-by-step instructions to configure GitHub branch protection rules for the `main` branch.

**Prerequisites:**
- You have admin access to the repository
- `.github/CODEOWNERS` file is committed (see included CODEOWNERS file)

---

## Step-by-Step Configuration

### 1. Navigate to Branch Protection Settings

1. Go to: **Settings → Branches** (URL: `github.com/ramirez-ai-labs/latino-canon/settings/branches`)
2. Click **"Add rule"** button
3. Enter branch name pattern: `main`

---

### 2. Configure Protection Rules

#### Rule 1: Require Pull Request Reviews
- ✅ Check: **"Require a pull request before merging"**
- ✅ Check: **"Require approvals"**
  - Set to: **1** approval required
- ✅ Check: **"Dismiss stale pull request approvals when new commits are pushed"**
- ✅ Check: **"Require review from code owners"**
  - This enforces the `.github/CODEOWNERS` file
- Leave unchecked: "Require approval of the most recent reviewable push"

**Why:** Ensures all code is reviewed and critical paths have owner sign-off.

---

#### Rule 2: Require Status Checks to Pass
- ✅ Check: **"Require branches to be up to date before merging"**
- ✅ Check: **"Require status checks to pass before merging"**

**Select these status checks (if they exist in your workflow runs):**
- `validate-pr` — TypeScript, tests, build
- `deploy-api` — API deployment validation
- `deploy-web` — Web deployment validation

**Note:** Status checks appear after the first workflow run. If you don't see them:
1. Run a test PR through the workflow first
2. Return here and select the checks that appear

**Why:** Prevents merging broken code or code that doesn't compile.

---

#### Rule 3: Require Conversation Resolution
- ✅ Check: **"Require conversations on pull requests to be resolved before merging"**

**Why:** Ensures every comment/concern is addressed before merge.

---

#### Rule 4: Restrict Force Pushes and Deletions
- ✅ Check: **"Restrict who can push to matching branches"**
  - Allow pushes by: **Administrators only**
- ✅ Check: **"Allow force pushes"**
  - Set to: **Disabled**
- ✅ Check: **"Allow deletions"**
  - Set to: **Disabled**

**Why:** Prevents accidental overwrites and branch deletion by contributors.

---

#### Rule 5: Require Linear History (Optional)
- ☐ Check: **"Require linear history"** (optional, only if no merge commits desired)
- Leave unchecked for now (allows merge commits)

**Why:** Ensures clean git history, but not critical for this project.

---

#### Rule 6: Include Administrators
- ✅ Check: **"Include administrators"**

**Why:** Even admins follow the same rules (prevents accidental rule bypass).

---

### 3. Save the Rule

Click **"Create"** button at the bottom.

---

## Verification

After saving, you should see:
- ✅ Rule applied to `main` branch
- ✅ All 6 conditions listed:
  1. Require pull request reviews (1 approval + code owners)
  2. Require status checks to pass
  3. Require conversation resolution
  4. Dismiss stale PR approvals on new commits
  5. Restrict who can push (admins only)
  6. Allow deletions: disabled

---

## Testing the Rules

1. **Create a test PR** with a simple change (e.g., typo fix)
2. **Attempt to merge without approval** → should be blocked ✅
3. **Add an approval** → merge button should enable ✅
4. **Modify PR after approval** → approval should become stale, merge button disabled again ✅

---

## How Rules Work in Practice

### For Regular Contributors:
- Can't push directly to `main` (must use PR)
- PR requires 1 approval + code owner sign-off for sensitive paths
- All status checks (CI/CD) must pass
- All review comments must be resolved

### For Data Additions:
- PRs that modify `canon.seed.json` require @vhr1975 review
- TMDB/metadata changes trigger validation checks
- Cannot merge until evaluation passes

### For Admins:
- Can push directly to `main` in emergencies
- But not recommended (keeps audit trail clean)

---

## Bypassing Rules (Emergency Only)

**Never** bypass these rules unless there's a critical production incident.

If you must:
1. Document why in a comment on the PR
2. Create a post-incident retrospective issue
3. Re-enable rules immediately after

---

## Troubleshooting

**"Status check is failing, but I can't see which one"**
→ Check the Actions tab to see detailed workflow output

**"Merge button still disabled after approval"**
→ Wait for all status checks to complete (green checkmarks)

**"Can't push to main even as admin"**
→ Branch protection rules apply to everyone by default. Use `git push --force` only in emergencies.

**"CODEOWNERS isn't triggering reviews"**
→ Verify `.github/CODEOWNERS` file exists and is committed
→ Check that the changed files match CODEOWNERS patterns

---

## Summary

| Setting | Value | Purpose |
|---------|-------|---------|
| Require PR reviews | 1 approval | Code quality gate |
| Code owner approval | Yes | Critical path protection |
| Status checks | validate-pr + deploy-* | Prevent broken merges |
| Conversation resolution | Yes | Ensure all concerns addressed |
| Force pushes | Disabled | Prevent accidental overwrites |
| Branch deletion | Disabled | Protect against accidents |
| Include admins | Yes | Consistent enforcement |

**Expected result:** A robust, auditable merge process that prevents mistakes while allowing efficient workflow.
