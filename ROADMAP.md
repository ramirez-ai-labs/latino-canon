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

## Immediate (do first — small, high-visibility)

1. **Fix the two empty homepage collections.** Found by testing live, not by reading
   code: `collection_items` has zero rows for any collection, so the "Core Canon"
   curated collection (the first, most prominent card on the homepage) shows nothing.
   Separately, the "Border Stories" smart collection filters on `theme:borderlands`,
   and no title has ever been tagged `borderlands` by the classifier — confirmed zero
   matches, even though *El Norte*, *Under the Same Moon*, and *Y Tu Mamá También* are
   textbook borderlands narratives (the model likely defaulted to `immigration`
   instead). Fix: populate `collection_items` for Core Canon editorially, and either
   add editor-sourced `borderlands` tags to titles that clearly qualify (the taxonomy's
   `editor` precedence already supports this) or repoint that collection at a theme
   with real coverage.
2. **Verify `pnpm eval:groundedness`'s rewritten judge actually works.** It was
   rewired from Anthropic's API to Workers AI's REST API in the Anthropic-removal
   work but has never actually been executed — needs a real `CLOUDFLARE_API_TOKEN`
   to test.

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

## Standing backlog (SDLC / completeness, unchanged priority)

7. Wire up `apps/ingest/src/maintenance.ts` (`retryErroredJobs`/`refreshPopularity`) —
   the nightly cron still does nothing real; every recovery from a stuck ingest job
   this project has needed so far has been a manual `force: true` re-POST.
8. Add tests for `workflow.ts`, `persist.ts`, `hybrid.ts` — the highest-risk,
   currently untested code, proven risky by every real bug found this session.
9. Add real linting (`turbo.json`/`package.json` advertise a `lint` task with no
   ESLint/Biome config and no per-package script behind it — currently dead
   scaffolding, not run in CI).
10. Smaller: add a LICENSE, a Dependabot config, confirm branch protection is
    actually enabled on `main` (unverifiable via API on a private repo), and clean up
    the `"community" as never` type-cast hack in `apps/web/src/lib/local-data.ts`.

## Deliberately deferred (Netflix's Stage 4, not needed yet)

Personalization — accounts, saved titles, watch/click history, per-viewer reranking
— is the last piece of the Netflix comparison and is intentionally out of scope for
now: there are no user accounts in this project at all, and at a curated
catalog of this size, editorial curation is a better signal than a cold-start
behavioral model would be. Revisit once the catalog and a real user base exist.
