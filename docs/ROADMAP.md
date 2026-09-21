# Roadmap

## Design philosophy: Spotify's retrieval + Netflix's curation

Two reference products, two different problems, both partially relevant here:

- **Spotify** solves "find a known or half-remembered item, instantly, out of an
  enormous catalog." Its unit is a track; its trick is aggressive lexical retrieval
  (prefix/typo tolerance, aliases) plus popularity signal.
- **Netflix** solves "decide which of a much smaller, richly-related catalog a
  specific viewer actually wants." Its search is explicitly framed as a
  personalization problem, not just keyword lookup, over titles with deep metadata
  (cast, credits, genre, availability).

Latino Canon's actual goal is a blend: **Spotify's "type anything and find it"
responsiveness** (including in Spanish, including half-remembered plot descriptions)
**over Netflix's kind of richly-related, curated catalog** (taxonomy, credits,
editorial "why it matters" context) — without either the personalization Netflix
needs (no accounts, no behavior signal) or the massive-scale ingest Spotify needs
(a curated canon, not the entire music industry).

What's already built genuinely earns both halves of that comparison:

| Capability | Spotify-like | Netflix-like |
|---|---|---|
| Hybrid BM25 + `bge-m3` multilingual semantic search, fused with RRF (`apps/api/src/search/hybrid.ts`) | ✅ fast known-item + fuzzy-meaning retrieval | |
| Alternate-title/alias layer (`title_aliases`, indexed into `titles_fts`) | ✅ finds a title by a name TMDB's own metadata never captured | |
| `inclusion_type`/theme taxonomy, `editor > seed > model` tag precedence (`packages/core/src/taxonomy.ts`) | | ✅ curation beats raw signal; guards against AI over-claiming identity |
| Editorial "why it matters" blurbs, grounded with cited sources shown in the UI | | ✅ |
| Curated + smart (filter-driven) collections (`apps/api/src/routes/collections.ts`) | | ✅ |
| Confidence-based human review queue (`ingest_jobs.status = 'needs_review'`, `GET /jobs`) | | ✅ |

What's missing before it *feels* like that blend to an actual user, honestly assessed
against that same framework, is the rest of this document.

---

## Presentation Readiness (Latino AI Summit 2026)

**Context:** Comprehensive codebase audit (2026-09-18) identified portfolio-polish items + robustness gaps. Summit talk scheduled; project live in production. Three-week plan to presentation-grade maturity.

### Week 1: Portfolio Polish (3.5 hours) — START HERE

These unlock presentation credibility and OSS legitimacy. **All done** — the
checkboxes below just hadn't been updated when the work landed:

- [x] **Add LICENSE file** — **Done.** MIT, repo root.

- [x] **Archive tactical phase documentation** — **Done.**
  `docs/archive/phases/` holds all 8 tactical docs; permanent docs (README,
  ROADMAP, CRITERIA, INGEST, infra/README) stayed at their normal paths.

- [x] **Add .dev.vars.example files** — **Done.** All three apps
  (`api`/`web`/`ingest`) have one.

- [x] **Add .dependabot.yml** — **Done.** `.github/dependabot.yml` exists;
  the string of `deps(deps)`/`ci(deps)`/`devdeps(deps-dev)` PRs (#121–#130)
  are it working.

- [x] **Create docs/operations/monitoring.md** — **Done.** Built around three real
  incidents rather than written generically: the blurb-approval silent-reset bug
  (#138), the stuck-jobs-behind-a-non-functional-retry pattern (#143/#144), and the
  Sept 2026 neuron budget burn (11.18k/10k, already in README). Covers AI Gateway
  access, neuron budget tracking, an incident response runbook, and informal
  performance targets. Explicitly documents what's *not* there yet (no Analytics
  Engine, no real alerting, no uptime monitoring) rather than implying more
  observability exists than actually does.

### Week 2: Robustness (9 hours) — Recommended

Hardens untested critical paths (8 bugs caught in recent phases, all in untested areas):

- [x] **Add tests for workflow.ts, persist.ts, hybrid.ts** — **Done**
  ([PR #152](https://github.com/ramirez-ai-labs/latino-canon/pull/152)).
  `workflow-rules.ts` extracts the three decision points out of `workflow.ts`'s
  `run()` (`jobIdFor`, `isYearMismatch`, `needsHumanReview`) into pure,
  binding-free functions with direct regression tests for the two real incidents
  that motivated this item (the Firefly `tmdbId` mismatch, the seed-tag
  review-gate bug). `persist.ts` and `maintenance.ts` got real D1-backed test
  infra (`apps/ingest/vitest.d1.config.ts`, mirroring `apps/api`'s existing
  pattern), covering `persistTitle`'s upsert/credit-replace/FTS-rebuild
  behavior, `writeTags`'s editor > seed > model precedence, and `writeBlurb`'s
  approval-preserving logic (#138's exact regression case). `hybrid.ts` got
  RRF fusion/candidate-pool/mode-bypass tests — which surfaced a real,
  unrelated bug along the way: `vi.mock()` for local modules silently no-ops
  under `@cloudflare/vitest-pool-workers` (it only mocks outbound requests),
  so those tests had to move to a second, plain-Node vitest config
  (`apps/api/vitest.unit.config.ts`) to actually run.

- [x] **Implement maintenance.ts retry logic** — **Done**
  ([PR #152](https://github.com/ramirez-ai-labs/latino-canon/pull/152)).
  `retryErroredJobs()` replays the exact `IngestParams` stored on the job row
  at creation time (new `ingest_jobs.params` column, migration `0018`) — never
  reconstructs them from `title_ref` alone, since guessing those from scratch
  is exactly what corrupted Firefly earlier this session. Jobs from before the
  migration have no stored params and are deliberately left alone rather than
  guessed at. `refreshPopularity()` pages through titles stale by 30+ days,
  re-fetching TMDB popularity, with one bad lookup unable to abort the rest of
  the batch. See
  [monitoring.md](operations/monitoring.md#2-stuck-ingest-jobs-behind-a-retry-mechanism-that-doesnt-retry).

- [x] **Complete groundedness evaluation** — **Done.** `run-groundedness.ts`
  auto-enumerates via `GET /titles?hasBlurb=1`. A real run against the whole
  canon (216 titles, 0 failures) is published in README's evaluation section:
  mean score 0.486 — only reachable after fixing the blurb-approval-reset bug
  (#138) that had every blurb sitting unapproved; see
  [monitoring.md](operations/monitoring.md#1-blurb-approval-silently-reset-on-every-re-ingest).

- [ ] **Add ESLint configuration** (60 min)
  - Remove dead `lint` task scaffolding
  - Add `.eslintrc.json` (recommend `eslint-config-next` for consistency)
  - Add `pnpm lint` script to all packages
  - Enable in CI (`validate-pr.yml`)

### Week 3: Evaluation & Tuning (13 hours) — Optional but Recommended

Optimizes retrieval quality and tunes thresholds responsibly:

- [x] **Expand golden query set** — **Done**, see item #6 below (62 queries).

- [x] **Tune RRF weights + thresholds** — **Done**, see item #6 below
  (`[1,1]` → `[2,1]`, `MIN_SEMANTIC_SCORE` tested and deliberately left at 0.35).

- [ ] **Generate OpenAPI spec** (120 min)
  - Use Hono OpenAPI middleware
  - Auto-generate `/openapi.json` on deployment
  - Deploy Swagger UI at `/docs` for integrators
  - Include in README API documentation section

---

## Immediate (do first — small, high-visibility)

1. ~~**Fix the two empty homepage collections.**~~ **Done.** Core Canon populated
   with a curated 10-title "start here" shortlist; Border Stories tagged with a real
   `borderlands` theme (*El Norte*, *Under the Same Moon* — the only two titles in
   the catalog actually about crossing) instead of the looser `immigration` proxy
   first tried. A follow-up pass checking every title's tags against what's actually
   known about each work also found and fixed two representation gaps the classifier
   missed: `queer_latino` wasn't tagged on *Vida* or *One Day at a Time* despite both
   centering a queer Latina character's arc, and *One Day at a Time* / *Gentefied*'s
   showrunner-creators weren't tagged `led_by` (only `created_by`), despite the
   taxonomy's own definition of `led_by` covering showrunners, not just directors.
2. ~~**Verify `pnpm eval:groundedness`'s rewritten judge actually works.**~~ **Done.**
   Not only works — running it surfaced the blurb-approval-reset bug (#138) and,
   once fixed, produced a real full-catalog score (mean 0.486, n=216, 0 failures),
   now published in README.

~~D1 migrations were entirely manual.~~ **Done.** Every migration in this project had
to be applied to production by hand via `wrangler d1 migrations apply --remote`
after merge — including one (0004) that was simply forgotten about for a day.
`deploy-api.yml` now applies pending migrations automatically (`continue-on-error`,
so a migration failure can't take an otherwise-good deploy down with it — which is
exactly what happened the first time it ran, tracing back to the CI
`CLOUDFLARE_API_TOKEN` never having been granted D1 permissions). `v0.2.0` was cut
once this was confirmed working end-to-end.

## Near-term: closing the Spotify gap (obscure/half-remembered search)

3. ~~**Alias / alternate-title layer.**~~ **Done.** A real `title_aliases` table
   (migration `0019`), indexed as a 6th `titles_fts` column (weight `3.0`, just under
   `title`'s `4.0`). Verified live *before* building this that `title`/
   `original_title` already cover most language-swap cases on their own (TMDB's own
   `original_title` is already indexed — "como agua para chocolate" already found
   *Like Water for Chocolate*); the real, confirmed gap was names TMDB's own fields
   never capture at all — a market-specific marketing retitle distinct from both
   `title` and `original_title`. Seeded one verified, live-confirmed proof case
   rather than a batch import (same discipline as the contextual schema's Griselda
   proof title): *Y Tu Mamá También* → "And Your Mother Too", the film's real US
   theatrical release title. `writeAliases()` (`apps/ingest/src/persist.ts`) handles
   both new ingests (`IngestParams.aliases`) and backfilling a title already in
   production (`POST /aliases`, `scripts/set-aliases.ts`) without a risky
   `force: true` re-ingest. Broader alias curation across the catalog is a deliberate
   follow-up, not bundled in here.
4. Typo tolerance in lexical search is currently just FTS5 prefix matching
   (`toFtsMatch` in `apps/api/src/search/lexical.ts`) — no real fuzzy/edit-distance
   correction. Lower priority than #3; semantic search already covers most of what
   this would add.

## Near-term: closing the Netflix gap (curation-aware ranking)

5. **Fold a curation-score term into ranking.** `hybrid.ts`'s RRF only balances BM25
   vs. semantic relevance — weights are still fixed at `[1, 1]`, and there is no
   popularity/curation dimension anywhere in the ranking path. `titles.popularity`
   (from TMDB) already exists and is unused for ranking. This is the concrete version
   of "editorial significance should be able to outrank raw relevance, and an obscure
   title shouldn't disappear just because fewer people searched for it" — needs a
   larger golden query set first (see #6) to tune responsibly rather than guessing.
6. ~~**Grow the golden eval set past 15 queries** and re-tune `hybrid.ts`'s RRF weights
   and `semantic.ts`'s `MIN_SEMANTIC_SCORE` floor against it — both are currently
   hand-picked heuristics, explicitly commented as such in the code.~~ **Done.** Grown
   to 62 queries (`packages/eval/src/datasets/queries.jsonl`), each verified against
   the live catalog before writing. `hybrid.ts`'s RRF weights retuned `[1,1]` →
   `[2,1]` (favor lexical) — a clean win (better recall@5/MRR/nDCG@10, recall@10
   unchanged, zero newly-broken queries), found by replaying the golden set offline
   against the live API's raw per-retriever rank order rather than redeploying
   repeatedly to sweep. `MIN_SEMANTIC_SCORE` tested at 0.45 but left at 0.35 — a real
   recall@5-vs-recall@10 trade-off, not a clean win, documented in place. Still worth
   growing further as the catalog grows past 219 titles — re-running the *original*
   15 queries at current scale (recall@5 0.889→0.744) is what turned this from
   optional into urgent; see the README's evaluation results section.
7. ~~**Netflix-style hero + carousel layout for collection/title pages.**~~ **Done.**
   Homepage rebuilt (PR #147) with a hero banner (search front and center) followed
   by a labeled horizontal-scroll `Rail` per collection (native scroll-snap, no
   carousel library) instead of the old flat wrap-grid. `TitleCard` kept the buried
   tags on the card face deliberately — that's the actual differentiator this item's
   own reasoning argued for keeping, not a leftover to fix. `/collections/[slug]`
   itself is still a plain grid, not a hero+carousel page; only the homepage got the
   full treatment.

## Representation honesty: contextual/critical-archive schema

A title can earn a clean `inclusion_type` tag and still deserve scrutiny of *how* it
represents Latino people or communities (a narco-drama with a Latina star/EP; a
sitcom praised at the time whose humor reads as stereotyping in retrospect).
`packages/core`'s `RepresentationHandling`/`ContextNote` types + the
`title_context_notes` table (migrations `0008`/`0009`) add a structured, queryable
place for that instead of a PR description that disappears from discovery. Landed
deliberately scoped to schema + one proof title (*Griselda*, 2024) rather than a
batch import — see PR #40. Two things came out of that review and were deliberately
deferred rather than bundled in:

12. **Scale the contextual schema to more titles**, following the same
    verify-every-credit discipline as `CRITERIA.md` rather than trusting a source
    list. Candidates raised in review, not yet individually verified: *Narcos*,
    *Queen of the South*, *Chico and the Man*, *Spanglish* as likely
    contextual/critical-archive cases; a longer research queue (*The Brothers
    García*, *Taina*, *Raising Victor Vargas*, *West Side Story* (1961), *I Love
    Lucy*, and ~20 more) as standard-tag candidates needing full credit audits
    before any tag — none of these should be added from the review's own claims
    without independent verification first, the same lesson this project has hit
    more than once (Tortilla Soup's director, Mask of Zorro under the old Spain
    rule, Filly Brown's release year).
13. ~~**Scope-boundary question: does the canon include internationally-produced Latin
    American cinema whose story doesn't center U.S. Latino/diaspora experience?**~~
    **Decided: yes**, per `CRITERIA.md`'s "Scope of 'Latino'" section — rule #4's
    `about_community` test was never actually written as U.S.-only, and a title like
    *A Poet* (Simón Mesa Soto, Colombian, set entirely in Medellín's art scene) passes
    it as written. Raised concretely (not hypothetically) while researching a 2026
    festival-circuit batch — see the seed file's history around that PR. *Motorcycle
    Diaries*, *Babel*, *Pan's Labyrinth*, *Y Tu Mamá También*, *Desperado*, and *Once
    Upon a Time in Mexico* (the titles that originally raised this question) still
    need their own individual verification pass under the now-decided rule, not an
    automatic re-add — a broader scope doesn't relax rule #1's credit-checking bar.
    **Follow-up, partially built:** a plain production-`country` filter is now
    surfaced in `SearchFilters` (the API already supported it end-to-end; it was
    never wired up in the UI) — lets users filter to e.g. Spain specifically (8 of
    218 titles are Spain-only productions; another 28 are Latin American films with
    Spanish co-production financing, not "Spain shows") without inventing a new
    category. This is objective and country-based, not the fuller distinction this
    item originally asked for (U.S./diaspora vs. Latin American cinema vs. Latin
    American filmmakers working in Hollywood vs. Latino actors in non-Latino-centered
    stories) — that would need a real editorial judgment call per title on top of
    what `inclusion_type` already carries, and is still not built.

## Standing backlog (SDLC / completeness, unchanged priority)

8. ~~Wire up `apps/ingest/src/maintenance.ts` (`retryErroredJobs`/`refreshPopularity`)~~
   **Done**, see Week 2 above.
9. ~~Add tests for `workflow.ts`, `persist.ts`, `hybrid.ts`~~ **Done**, see Week 2
   above.
10. Add real linting (`turbo.json`/`package.json` advertise a `lint` task with no
    ESLint/Biome config and no per-package script behind it — currently dead
    scaffolding, not run in CI).
11. ~~Smaller: add a LICENSE, a Dependabot config, confirm branch protection is
    actually enabled on `main`~~ LICENSE and Dependabot: **done**, see Week 1 above.
    Branch protection: confirmed via the GitHub API (not just "unverifiable") that
    it's literally impossible to enable while the repo is private without GitHub
    Pro — going public unlocks it for free, and it should be turned on immediately
    after that flip, since nothing currently stops a direct push to `main`. Still
    open: clean up the `"community" as never` type-cast hack in
    `apps/web/src/lib/local-data.ts`.
14. **Process rule, found the hard way (PR #40/#41): `deploy-api.yml` (runs
    migrations) and `ingest-new-titles.yml` (POSTs new titles for async ingestion)
    both trigger off the same merge push and run in parallel, with no ordering
    guarantee between them.** An editor migration that targets a title seeded in that
    *same* PR will very likely run before the title's multi-step ingest Workflow
    finishes, silently no-op against a guarded `WHERE EXISTS`/`WHERE id = ...` that
    can't yet find the row (see `migrations/0011`, backfilling what `0009` should have
    done for *Griselda*). Until this has a real CI fix (making `deploy-api.yml` wait
    on ingestion, or moving migrations after it), the rule is: a migration that
    tags/annotates a title introduced in the same PR ships as a **follow-up** PR after
    ingestion is confirmed complete via the live API, not bundled into the title's own
    introducing PR.
15. **No tracking of cumulative Workers AI neuron usage across a day's ingest
    batches.** Found the hard way: growing the catalog by ~85 titles in one session
    (plus a ~60-title remediation re-ingest) burned 11.18k of the account's 10k daily
    neuron cap on `classify`/`blurb` alone, which also broke live search for the rest
    of the day (`GET /search` depends on the same account-wide budget). See the
    README's "Free-tier budget" section for the full writeup. `post-titles.ts`'s
    `BATCH = 4` rate-limits a single run; nothing tracks the running total *across*
    runs in a day, and the cap is shared with any other Workers AI usage on the same
    Cloudflare account. Worth either a lightweight neuron-spend tracker before a large
    batch, or just a standing discipline of checking current usage first — the
    latter is now written down as a manual check in
    [monitoring.md](operations/monitoring.md#alert-neuron-budget-headroom), which
    closes the "at least document the discipline" half of this item. A real
    in-code tracker is still open.
16. ~~**Decade filter matches release year, not story setting — found via the golden-set
    expansion above.**~~ **Done.** A query mentioning a decade the story is *set in*
    ("1940s Los Angeles pachuco riots stage musical" → *Zoot Suit*, released 1981) got
    that decade extracted as a hard filter on `yearStart`, zeroing every result before
    ranking ever ran. Rather than trying to reliably distinguish "story setting" from
    "release year" in free text, `apps/api/src/routes/search.ts` now retries without a
    filter if it came from free-text interpretation (not an explicit query param) and
    produced zero results — the same "return something over nothing" logic `hybrid.ts`
    already used for an empty browse query. Verified live: the query above now returns
    *Zoot Suit* at #1. Re-running the full 62-query eval after this fix improved every
    metric with zero new regressions (hybrid recall@5 0.816→0.832, recall@10
    0.856→0.872).

## Deliberately deferred (Netflix's Stage 4, not needed yet)

Personalization — accounts, saved titles, watch/click history, per-viewer reranking
— is the last piece of the Netflix comparison and is intentionally out of scope for
now: there are no user accounts in this project at all, and at a curated
catalog of this size, editorial curation is a better signal than a cold-start
behavioral model would be. Revisit once the catalog and a real user base exist.
