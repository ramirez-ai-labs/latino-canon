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
| Curation agent (`POST /agents/curate`, `apps/api/src/agents/`) — transparent, step-by-step reasoning trail over the same hybrid search | ✅ multi-signal query (theme/decade/director gender/tone) | ✅ shows its work instead of hiding the algorithm |

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
  **Correction (2026-09-24):** that 0.486, and every groundedness run before
  [#216](https://github.com/ramirez-ai-labs/latino-canon/pull/216), measured nothing: the
  judge was given each source's `ref` (a title slug, a director's name), never the synopsis
  text. The first valid baseline is **0.682** (judge v3, see Week 4 below).

- [x] **Add ESLint configuration** — **Done** ([PR #169](https://github.com/ramirez-ai-labs/latino-canon/pull/169)).
  ESLint v9 flat config (`eslint.config.js`) wired across all workspaces with
  environment-specific rule strictness: React/Next.js (relaxed), Workers (moderate),
  core packages (strict). Linting integrated into CI (`validate-pr.yml`); all workspace
  `lint` scripts active and enforced.

### Week 3: Evaluation & Tuning (13 hours) — Optional but Recommended

Optimizes retrieval quality and tunes thresholds responsibly:

- [x] **Expand golden query set** — **Done**, see item #6 below (62 queries).

- [x] **Tune RRF weights + thresholds** — **Done**, see item #6 below
  (`[1,1]` → `[2,1]`, `MIN_SEMANTIC_SCORE` tested and deliberately left at 0.35).

- [x] **Generate OpenAPI spec** — **Done** ([PR #170](https://github.com/ramirez-ai-labs/latino-canon/pull/170)).
  OpenAPI 3.0 specification (`apps/api/src/openapi/spec.ts`) covers all endpoints
  with request/response schemas and error codes. Served at `GET /openapi.json`
  (zero runtime overhead — static JSON). Fully documented in [docs/API.md](../API.md)
  with Swagger UI and ReDoc integration instructions; spec verified against live
  catalog (219 titles).

### Week 4: Eval integrity & search quality (v1.2.0 → the talk) ✅ CORE WORK COMPLETE

**Context (2026-09-23/24):** a review of the ingest → embed → retrieve → rank pipeline
found that two production search regressions and an invalid groundedness metric had all
gone unnoticed, because no eval ran automatically and the judge never saw its evidence.
Order below: fix the measurements first, then what they measure.

**Deployed (v1.2.0):**
- [x] **Search index integrity** — [#213](https://github.com/ramirez-ai-labs/latino-canon/pull/213).
  An earlier Vectorize rebuild had wiped `kind`/`decade` metadata (every filtered semantic
  query returned 0); contentless FTS kept stale text searchable; the `tags` column was
  always empty. One embedding contract in `packages/core`.
- [x] **Filter-only queries + one-at-a-time relaxation** —
  [#214](https://github.com/ramirez-ai-labs/latino-canon/pull/214). "animation films" lists
  all 8 animated titles.
- [x] **Inferred filters re-rank instead of excluding** —
  [#215](https://github.com/ramirez-ai-labs/latino-canon/pull/215). Hybrid recall@5 on the
  original 62 queries 0.680 → 0.806 (baseline before genre inference: 0.832).
- [x] **1. Blurb integrity** — [#216](https://github.com/ramirez-ai-labs/latino-canon/pull/216).
  The groundedness judge now scores against real source text; citations render as
  footnotes; pre-fix runs are labeled invalid (kept) on the Eval page.
- [x] **1b. Judge accuracy (v3)** — [#217](https://github.com/ramirez-ai-labs/latino-canon/pull/217).
  70B judge, claim-focused prompt. **The judge is frozen from here** so blurb changes can
  be measured before/after.
- [x] **3. Retrieval eval as a deploy check** — [#219](https://github.com/ramirez-ai-labs/latino-canon/pull/219).
  Runs after every api deploy (hybrid) and weekly (all modes); golden set grown to 77 with
  per-category scores. Baseline 0.763; Spanish 0.453 vs plot 0.799.
- [x] **Release v1.2.0.**

**Completed (Sept 24, 2026):**
- [x] **2. Re-baseline v3 (run 1 complete)** — Baseline established: **0.682** (211/212 blurbs).
  Genre backfill 52% → 100%, content-advisory backfill 55% → 100%. Vectorize rebuilt with
  all 223 titles re-embedded. Run 2 (consistency check) TBD later UTC day.
- [ ] **4. Exact-title match always wins.** A normalized title, original-title or alias
  match ranks first and skips the LLM rewrite ("y tu mama tambien" currently ranks #2).
  No neurons. *Keyword-only fallback is done:* a failed query embedding (e.g. neurons
  exhausted) now returns keyword results flagged `degraded` - never cached, and the
  retrieval eval refuses to score them - instead of a 500.
- [ ] **6. Better blurbs.** ~120 of ~140 blurbs the v3 judge flags fail on one "It
  matters…" sentence no source supports. Add the OMDb awards/ratings the workflow already
  fetches (and discards) as sources; second sentence factual or source-backed; name the
  work by its title (the Linha de Passe blurb called the film by its character's name).
  Validate on a ~30-title sample, then roll out in daily batches. **Decide the approval
  path first** - `writeBlurb` resets `approved` when text changes and cards show only
  approved blurbs.
- [ ] **5. Rewrite rework.** *Cache-first is done:* the cache is checked before the LLM
  call, keyed on the normalized raw query, and uncached queries are rate-limited per
  client (30/min, Rate Limiting binding). Still open: search on the user's original words (the rewrite drops content words like
  "telenovela"); LLM extracts filters only; lower the `tags` column's BM25 weight.
  Saves neurons.
- [ ] **5b. Spanish search.** Spanish recall@5 0.453 vs 0.799 for the same queries in
  English. Diagnose first: rewrite, embeddings, or the English-only keyword index.
- [ ] **7. Embedding drift detection.** Store a hash of each title's embedding text; the
  nightly cron re-embeds titles whose hash changed.
- [ ] **8. Classifier eval.** Precision/recall per `inclusion_type` against seed labels.
  Seed tags overwrite the model's own output, so this re-classifies seed titles - on a
  sample.

**Workers AI budget** (10k neurons/day, resets 00:00 UTC; measured 2026-09-24 via the
`aiInferenceAdaptiveGroups` analytics dataset). Live search ~0.5–0.7k/day; ingest batch
days 3–11k (70B); groundedness judge ~2.8k/run; retrieval eval ~0.15k (hybrid) /
~0.4k (all modes). Rules: at most one 70B job (judge, blurb regeneration) per day and
never on an ingest day; sample before full runs; no ad-hoc production eval runs; weekly,
not nightly, schedules.

### Week 5: Latin American cinema expansion (in progress)

**Context (2026-09-24):** Phase 1 added 15 titles from Brazil, Mexico, Argentina, Chile
and Colombia, sourced from `docs/LATIN_AMERICAN_CINEMA_95_TITLES.csv`. A post-merge check
against the live API found only 8 of the 15 ingested correctly: 2 resolved to the wrong
film and 5 never ingested. The CSV itself is a generated list and had wrong director
credits and some non-Latino titles. Order below: stop wrong-film ingests, repair Phase 1,
then expand.

**Done:**
- [x] **Phase 1 seed entries** — [#226](https://github.com/ramirez-ai-labs/latino-canon/pull/226)
  (Brazil), [#227](https://github.com/ramirez-ai-labs/latino-canon/pull/227) (Mexico),
  [#229](https://github.com/ramirez-ai-labs/latino-canon/pull/229)/[#232](https://github.com/ramirez-ai-labs/latino-canon/pull/232)
  (Chile), [#231](https://github.com/ramirez-ai-labs/latino-canon/pull/231) (Argentina + Colombia).
- [x] **The Wolf House director corrected** (Cristóbal León & Joaquín Cociña, not the
  name the CSV gave) — [#233](https://github.com/ramirez-ai-labs/latino-canon/pull/233).
- [x] **Duplicate *The Maid* (2009) seed entry removed** — [#234](https://github.com/ramirez-ai-labs/latino-canon/pull/234).
  `/seed-load` skips existing slug ids, so no duplicate row reached production.

**Phase 1 live status** (checked 2026-09-24 against `/search` and `/titles/:id`):

| Status | Titles |
|---|---|
| Correct (8) | Limite, Pixote, The Exterminating Angel, Zama, The Wolf House, The Strategy of the Snail, Birds of Passage, Monos |
| Wrong film (2) | *Los olvidados* → `los-olvidados-2014` (a 2014 film, not Buñuel's 1950); *Manuel Rodríguez* → `manuel-rodriguez-1910` (a 1910 silent film) |
| Not ingested (5) | Terra em Transe, Canoa, Rojo amanecer, The Battle of Chile, La vendedora de rosas |

**Second finding (2026-09-25): the Phase 1 PRs overwrote each other's seed entries.**
Each PR appended to the end of `canon.seed.json` from the same base, and each merge
replaced the previous PR's entries instead of keeping them: #227 dropped #226's Brazil
titles (*Limite*, *Terra em Transe*, *Pixote*), and #229 dropped #227's Mexico titles
(*Los olvidados*, *The Exterminating Angel*, *Canoa*, *Rojo amanecer*). *Limite*, *Pixote*,
*The Exterminating Angel* and the wrong *Los olvidados* are live but no longer in the seed
file; *Terra em Transe*, *Canoa* and *Rojo amanecer* never ingested and their entries are
gone. CI now rejects a PR that drops a seed entry unless it's listed in the file's
`removed` ledger with a reason - replaying #227 and #229 through it flags all seven.

**Root cause (wrong/missing ingests):** a seed entry without a `tmdbId` resolves through TMDB title search, which
requires an exact title match (`resolveTmdbId`, `apps/ingest/src/sources/tmdb.ts`).
TMDB returns English titles ("Entranced Earth", "The Rose Seller"), so Spanish and
Portuguese seed titles find no exact match and fail. When a *different* film shares the
exact title, it is accepted whatever its year: the ±2-year guard (`isYearMismatch`,
`apps/ingest/src/workflow-rules.ts`) only covers pinned ids.

**Next (in order):**
- [x] **1. Year guard on search matches.** Every TMDB match, pinned or searched, must be
  within 2 years of the seed year. Checked against the live catalog first: no correctly
  matched title is further than that, so the bar rejects only wrong films. CI now also
  validates seed PRs (`seed-validate.ts`): new entries must pin `tmdbId`, and duplicates
  or unknown inclusion types fail.
- [x] **1b. Seed removal guard.** A title can't leave `canon.seed.json` without a
  `removed` ledger entry and reason (`seed-validate.ts`).
- [x] **2a. Seven dropped entries restored** with pinned, TMDB-verified ids and tags
  re-checked against CRITERIA.md: `breakthrough` kept only where citable (*Los olvidados*:
  UNESCO Memory of the World, 2003; *Limite*: #1 in Abraccine's 2015 Top 100), and
  `about_community` dropped from *Limite* and *The Exterminating Angel*. The three already
  live are skipped at ingest; their live tags still carry the old `breakthrough` (#5).
- [ ] **2. Phase 1 data repair (rest).** Restore the seven dropped entries (above) and pin verified
  `tmdbId`s for Los olvidados (1950), Terra em Transe, Canoa, Rojo amanecer, The Battle of
  Chile and La vendedora de rosas - plus Limite, Pixote and The Exterminating Angel, which
  are live but need their seed entries back.
  Remove *Manuel Rodríguez* (1977): the film's existence isn't confirmed (CRITERIA rule #6).
- [ ] **3. Production cleanup** (needs sign-off: changes live data). Delete
  `los-olvidados-2014` and `manuel-rodriguez-1910`, re-ingest the pinned titles, rebuild
  Vectorize.
- [ ] **4. Catalog-wide year audit.** *Report done (2026-09-25):* comparing the seed
  file with live D1 (by pinned id, else normalized title) found 7 wrong films live. Five
  have **wrong pinned `tmdbId`s** in the seed file, ingested on 2026-09-17 (#103), three
  days before pinned ids were year-checked (#152): *7 Boxes* (2012) →
  `no-hands-on-the-clock-1941`, *Paulina* (2015) →
  `national-geographic-meister-der-naturfotographie-2009`, *Casa Grande* (2014) →
  `walk-the-dark-street-1956`, *The Year My Parents Went on Vacation* (2006) →
  `cirque-du-soleil-la-magie-continue-1987`, *The Line* (2019) →
  `the-cornstarch-gizmo-2008`. Two came from search: *A Queda* (1978) → `a-queda-2025`,
  and *Manuel Rodríguez* (see #3). 20 seed entries match no live title by id or name (e.g.
  *Sin Nombre*, *Heli*, *The Heiresses*). Fix: correct the five pins, then fold these
  into #3's cleanup.
- [x] **4d. Wrong pins corrected in the seed file.** 28 pins re-pointed at the right
  films and 4 missing pins added (*A Queda*, *Martín (Hache)*, *The Battle of Chile* Part I,
  *La vendedora de rosas*), each checked against TMDB credits for the director.
  *Manuel Rodríguez* (1977) moved to `removed`. Re-ingest the 31 not yet live a few per
  day with `pnpm --filter @latino-canon/ingest ingest:refs "<ref>" ...`.
- [x] **4b. Name check at ingest.** A pinned-id audit by title (not just year) found
  **28 of 90 pinned `tmdbId`s point at unrelated works** - 11 live as wrong films
  (*Monarca* → a swamp reality show, *The Club* → a kids' series), 17 never ingested
  (*Heli* → a 1968 cartoon, *Sin Nombre* → *A.P.E.X.*). `isTitleMismatch` now rejects a
  TMDB match whose title and original title don't resemble the seed title or an alias;
  calibrated on the live catalog it catches all 28 and passes every correct title.
- [ ] **4c. Re-pin the 28 and delete the 11 wrong films** (plus `los-olvidados-2014`,
  `manuel-rodriguez-1910`, `a-queda-2025`).
- [ ] **5. Phase 1 tag audit.** All 15 were tagged `breakthrough` without a citation;
  CRITERIA.md requires a documented, citable first.
- [ ] **6. Phase 2, one PR.** The remaining CSV titles, each run through CRITERIA.md
  individually (rule #8: a generated list is a research source, not an import queue):
  director heritage confirmed from a source, only earned tags, a citable `breakthrough`,
  and a pinned `tmdbId`. Rows with an unconfirmable ("Unknown") director are dropped.
  Known CSV errors to correct on the way: *Embrace of the Serpent* is Ciro Guerra's (not
  Cary Joji Fukunaga's); *The Comedians* (Peter Glenville) and *Walker* (Alex Cox) have
  British directors; *Lumumba: Death of a Prophet* is about the Congo.

**Open decision:** the CSV's 7 Haiti titles fall outside the current scope in
CRITERIA.md (Hispanic heritage broadly, plus Brazil). Either keep them out, or widen the
scope in CRITERIA.md in its own PR before Phase 2.

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
   **Correction (2026-09-24):** the judge did run, but it never saw the source text, so
   0.486 wasn't a real score - see Week 4 item 1.

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
10. ~~Add real linting~~ **Done**, see Week 2 above ([PR #169](https://github.com/ramirez-ai-labs/latino-canon/pull/169)).
11. ~~Smaller: add a LICENSE, a Dependabot config, confirm branch protection is
    actually enabled on `main`~~ LICENSE and Dependabot: **done**, see Week 1 above
    — though Dependabot was later disabled again (repo went public, then
    Dependabot's own update PRs caused repeat breaking-change chaos: TypeScript
    5→7 a second time, an untested zod 3→4 major bump), pending either a
    post-merge lockfile-sync CI step or scoping it to security-only updates
    (both raised, neither built yet). Branch protection: **done** — required
    status checks + 1 approving review + CODEOWNERS
    ([PR #166](https://github.com/ramirez-ai-labs/latino-canon/pull/166)). The
    review requirement has no second human to satisfy it on a solo-maintainer
    repo, so every PR since has needed an admin-override merge — worth deciding
    whether to relax back to 0 approvals or actually bring in a second reviewer.
    Still open: clean up the `"community" as never` type-cast hack in
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
    in-code tracker is still open. Measured per-job costs and a CLI usage query are now in
    monitoring.md's "Neuron budget" section (Week 4).
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
    **Superseded (2026-09-23):** dropping *every* inferred filter on zero results also
    dropped the correct ones ("películas animadas": a bad `country=MX` took the good
    `genre=Animation` down with it). Now filter-only queries relax one inferred filter at a
    time, least trustworthy first (#214), and inferred filters on queries with real
    content only re-rank (#215) - see Week 4.

## Post-v1.0.0 Nice-to-Haves (Completed)

- [x] **Self-hosted Swagger UI for both workers** — **Done** ([PR #174](https://github.com/ramirez-ai-labs/latino-canon/pull/174), fixed in [PR #175](https://github.com/ramirez-ai-labs/latino-canon/pull/175)).
  - 🚀 [Public API `/docs`](https://latino-canon-api.ai-builders-studio-latinx.workers.dev/docs) — Interactive search documentation
  - 🔐 [Admin Ingest `/docs`](https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev/docs) — Authenticated API explorer with token management
  - Zero external documentation dependencies; jsDelivr-hosted Swagger UI
  - Browser-based token storage (localStorage) for seamless admin access
  - Full OpenAPI specs auto-generated for both workers

---

## Deliberately deferred (Netflix's Stage 4, not needed yet)

Personalization — accounts, saved titles, watch/click history, per-viewer reranking
— is the last piece of the Netflix comparison and is intentionally out of scope for
now: there are no user accounts in this project at all, and at a curated
catalog of this size, editorial curation is a better signal than a cold-start
behavioral model would be. Revisit once the catalog and a real user base exist.
