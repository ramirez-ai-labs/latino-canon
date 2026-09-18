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

These unlock presentation credibility and OSS legitimacy:

- [ ] **Add LICENSE file** (10 min)
  - Use MIT or Apache-2.0 (GitHub repo should default to MIT)
  - Legal clarity for portfolio/open-source consumption
  - Add to repo root, commit

- [ ] **Archive tactical phase documentation** (30 min)
  - Create `docs/archive/phases/` directory
  - Move: `PHASE_C_*.md`, `PHASE_D_*.md`, `FIX_SCHEMA_REBUILD.md`, `CLEANUP_*.md`, `PROJECT_COMPLETION_SUMMARY.md`, `SESSION_6_*.md`
  - Keep as history; link from README: "See [Phase Documentation](docs/archive/phases/) for detailed development logs"
  - Permanent docs remain: README, ROADMAP, CRITERIA, INGEST, infra/README

- [ ] **Add .dev.vars.example files** (15 min)
  - `apps/api/.dev.vars.example` (list required vars)
  - `apps/web/.dev.vars.example` (list required vars)
  - Ingest already has one; verify completeness
  - Document in README setup instructions

- [ ] **Add .dependabot.yml** (20 min)
  - Enable automated security updates
  - Set schedule to weekly, max 5 open PRs
  - Reduces manual dependency management

- [ ] **Create docs/operations/monitoring.md** (120 min) — HIGHEST IMPACT
  - **AI Gateway access**: How to read logs, cache hit rates, neuron budget
  - **Cloudflare Analytics Engine**: Query patterns for error tracking, request patterns
  - **Neuron budget tracking**: 10k/day limit, reset at midnight UTC, account-wide cap
  - **Alert thresholds**: "Page on" rules for outages or quota exhaustion
  - **Incident response runbook**: What to do if search degrades, workers AI down, D1 issues
  - **Performance SLAs**: Latency targets, cache hit rate goals, uptime targets
  - Reference: neuron budget incident from Sept 2026 (11.18k burn story in README)

### Week 2: Robustness (9 hours) — Recommended

Hardens untested critical paths (8 bugs caught in recent phases, all in untested areas):

- [ ] **Add tests for workflow.ts** (90 min)
  - Step orchestration, retry behavior, error tracking
  - Mock TMDB/OMDb responses
  - Verify low-confidence→review_queue routing

- [ ] **Add tests for persist.ts** (60 min)
  - D1 insert/update, tag insertion, people dedup
  - Verify FTS5 denormalization

- [ ] **Add tests for hybrid.ts** (60 min)
  - RRF rank merging math, score normalization
  - Filter push-down behavior

- [ ] **Implement maintenance.ts retry logic** (120 min)
  - `retryErroredJobs()`: reconstruct IngestParams from job_ref, re-POST to workflow
  - `refreshPopularity()`: TMDB-fetch popularity scores for existing titles
  - Verify cron trigger (8 AM UTC) actually runs

- [ ] **Complete groundedness evaluation** (120 min)
  - `run-groundedness.ts` currently requires manual title IDs
  - Modify to enumerate all titles (or all with blurbs)
  - Publish results to `.eval-out/groundedness-*.json`
  - Add to README evaluation section

- [ ] **Add ESLint configuration** (60 min)
  - Remove dead `lint` task scaffolding
  - Add `.eslintrc.json` (recommend `eslint-config-next` for consistency)
  - Add `pnpm lint` script to all packages
  - Enable in CI (`validate-pr.yml`)

### Week 3: Evaluation & Tuning (13 hours) — Optional but Recommended

Optimizes retrieval quality and tunes thresholds responsibly:

- [ ] **Expand golden query set** (480 min)
  - Grow from 15 → 50+ real queries
  - Collect relevance judgments (5-point scale or binary relevant/not)
  - Document in `packages/eval/src/datasets/queries.jsonl`

- [ ] **Tune RRF weights + thresholds** (120 min)
  - Re-run `pnpm eval:retrieval` with expanded query set
  - Optimize `hybrid.ts` RRF weights (currently [1,1], hand-picked)
  - Tune `semantic.ts` `MIN_SEMANTIC_SCORE` (currently 0.35, heuristic)
  - Document tuning decisions and trade-offs in ROADMAP

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
2. **Verify `pnpm eval:groundedness`'s rewritten judge actually works.** It was
   rewired from Anthropic's API to Workers AI's REST API in the Anthropic-removal
   work but has never actually been executed — needs a real `CLOUDFLARE_API_TOKEN`
   to test.

~~D1 migrations were entirely manual.~~ **Done.** Every migration in this project had
to be applied to production by hand via `wrangler d1 migrations apply --remote`
after merge — including one (0004) that was simply forgotten about for a day.
`deploy-api.yml` now applies pending migrations automatically (`continue-on-error`,
so a migration failure can't take an otherwise-good deploy down with it — which is
exactly what happened the first time it ran, tracing back to the CI
`CLOUDFLARE_API_TOKEN` never having been granted D1 permissions). `v0.2.0` was cut
once this was confirmed working end-to-end.

## Near-term: closing the Spotify gap (obscure/half-remembered search)

3. **Alias / alternate-title layer.** Nothing today lets "the road trip movie" or a
   common misspelling or a Spanish nickname find *Y Tu Mamá También* except semantic
   search happening to catch it. A real `title_aliases` table (alternate titles,
   translated titles, common misspellings, notable character names) indexed into
   `titles_fts` would directly implement the "obscure song" search experience this
   project was originally inspired by — and is the single most Spotify-flavored gap
   left.
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
6. **Grow the golden eval set past 15 queries** and re-tune `hybrid.ts`'s RRF weights
   and `semantic.ts`'s `MIN_SEMANTIC_SCORE` floor against it — both are currently
   hand-picked heuristics, explicitly commented as such in the code.
7. **Netflix-style hero + carousel layout for collection/title pages.** Prompted by
   comparing our `TitleCard`/`/collections/[slug]` grid against an actual Netflix
   collection page: Netflix's card shows the full synopsis inline (not a truncated
   teaser) and its own AI-generated mood/tone tags ("Witty, Irreverent, Romantic")
   are conceptually the same move as our `inclusion_type`/theme tags — just
   presented as a details-panel afterthought rather than the product's whole point,
   which is the opposite of this project's actual differentiator (`TitleCard`'s own
   comment: surfacing the model's output on its face "is the whole point of the
   product"). Worth borrowing the layout (hero banner + horizontal carousel instead
   of a plain grid), not the buried-tags approach.

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
    **Follow-up, not yet built:** the separate filter facets this decision implies
    (U.S./diaspora stories vs. Latin American cinema vs. Latin American filmmakers
    working in Hollywood vs. Latino actors in non-Latino-centered stories) so users
    can actually distinguish these categories in search/browse, rather than everything
    just being `about_community` with no further distinction.

## Standing backlog (SDLC / completeness, unchanged priority)

8. Wire up `apps/ingest/src/maintenance.ts` (`retryErroredJobs`/`refreshPopularity`) —
   the nightly cron still does nothing real; every recovery from a stuck ingest job
   this project has needed so far has been a manual `force: true` re-POST.
9. Add tests for `workflow.ts`, `persist.ts`, `hybrid.ts` — the highest-risk,
   currently untested code, proven risky by every real bug found this session.
10. Add real linting (`turbo.json`/`package.json` advertise a `lint` task with no
    ESLint/Biome config and no per-package script behind it — currently dead
    scaffolding, not run in CI).
11. Smaller: add a LICENSE, a Dependabot config, confirm branch protection is
    actually enabled on `main` (unverifiable via API on a private repo), and clean up
    the `"community" as never` type-cast hack in `apps/web/src/lib/local-data.ts`.
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
    batch, or just a standing discipline of checking current usage first.

## Deliberately deferred (Netflix's Stage 4, not needed yet)

Personalization — accounts, saved titles, watch/click history, per-viewer reranking
— is the last piece of the Netflix comparison and is intentionally out of scope for
now: there are no user accounts in this project at all, and at a curated
catalog of this size, editorial curation is a better signal than a cold-start
behavioral model would be. Revisit once the catalog and a real user base exist.
