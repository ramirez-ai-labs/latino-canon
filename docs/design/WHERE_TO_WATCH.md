# Where to watch: streaming, free and rent/buy availability per title

**Status:** Proposed (2026-10-13). Nothing here is built. Section "Decisions needed" lists what to
settle before PR 1.

## Why

A title page answers "what is this and why does it matter", and then stops. The next thing a reader
asks is *where can I watch it?* - can I stream it, is it free anywhere, can I rent or buy it. Today
the site can't answer, so the reader has to leave to find out.

That question is sharper for this catalog than for a streaming service's own. Much of the canon is
festival and archival Latin American cinema (*Araya*, *Limite*, *Hamaca paraguaya*, *La Ciénaga*),
which tends to be scattered across niche services or not streaming at all, and library apps (Kanopy,
Hoopla) carry a lot of this kind of film - free with a library card, and invisible to anyone who
doesn't know to look. "Free with your library
card" is the most useful answer this feature can give, and the most on-mission.

## Goals and non-goals

**Goals**

- Show, per title, where it's available in the reader's region, grouped as **Stream** (subscription),
  **Free** (free and ad-supported, including library services), and **Rent or buy**.
- Say plainly when a title isn't available anywhere in that region. That's an answer, not an error.
- Show how current the data is ("Checked 3 days ago").
- **$0 and zero neurons**, within the free tier (CLAUDE.md #1, #2). No model is involved anywhere.

**Non-goals**

- Deep links into a provider's app. TMDB doesn't supply them (see "Data source").
- Any source other than legitimate providers. "Can I download it" is answered with rent, buy and
  library options, never piracy sites.
- Real-time accuracy. Availability changes weekly; a few days' lag is acceptable if it's labeled.
- A search filter ("free to stream") in the first release. It's PR 5, after the data has proven
  reliable (see "Plan").

## Data source: TMDB watch providers (JustWatch)

TMDB's `watch/providers` data, which TMDB sources from JustWatch, gives per country:

- `flatrate` (subscription), `free`, `ads`, `rent`, `buy` - each a list of providers with a name,
  logo path, provider id and display priority.
- `link` - TMDB's watch page for the title in that region, which links out to the providers.

Why this source:

- **We already call TMDB for every title**, with a pinned id (CRITERIA.md rule 10), so matching is
  exact. No fuzzy title search.
- **It costs no extra request.** `fetchTmdbDetails` (`apps/ingest/src/sources/tmdb.ts`) already uses
  `append_to_response=credits,external_ids`; adding `watch/providers` to that list returns the
  availability in the same response. This matters because the free plan caps a Worker invocation's
  outbound fetches (50), and the daily cron already spends them on the queue and the popularity refresh.
- **All regions come back in one response**, so supporting Mexico or Spain later costs nothing at
  fetch time - only storage.

Terms to honor:

- **Attribution to JustWatch is required** wherever the data appears: "Availability data from
  JustWatch", next to the section, plus a line in About's "Data sources" (added in #328).
- **No deep links.** The section links to TMDB's `link` for the region ("See all options"), which is
  where TMDB's terms send readers.

## Design

### Data model (migration `0031_watch_providers.sql`)

```sql
CREATE TABLE watch_providers (
  title_id TEXT NOT NULL REFERENCES titles(id),
  region TEXT NOT NULL,            -- ISO 3166-1 alpha-2, e.g. 'US'
  category TEXT NOT NULL,          -- 'stream' | 'free' | 'rent' | 'buy'
  provider_id INTEGER NOT NULL,    -- TMDB's provider id
  provider_name TEXT NOT NULL,
  logo_path TEXT,                  -- TMDB image path, e.g. '/abc.jpg'
  display_priority INTEGER NOT NULL,
  PRIMARY KEY (title_id, region, category, provider_id)
);

-- Per title and region: when it was checked, and TMDB's watch page.
-- A row with no providers is how "checked, available nowhere" is stored.
CREATE TABLE watch_availability (
  title_id TEXT NOT NULL REFERENCES titles(id),
  region TEXT NOT NULL,
  tmdb_link TEXT,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (title_id, region)
);
```

`free` and `ads` merge into one **Free** category: to a reader, both mean "watch without paying",
and the ad distinction shows in the provider's name (Tubi, Pluto). The schema keeps the categories a
reader sees, not TMDB's.

Only the regions in `WATCH_REGIONS` (packages/core, see "Decisions needed") are stored; the rest of
TMDB's response is dropped. With ~370 titles, 3 regions and ~6 providers each, that's ~7k rows - far
under D1's free limits.

### Ingest

- **At ingest:** `fetchTmdbDetails` appends `watch/providers`; `normalize.ts` maps it to the rows
  above; `persist.ts` replaces the title's rows in one batch (delete + insert per region), together
  with its `watch_availability` row.
- **Refresh:** the daily cron's `refreshPopularity` (`maintenance.ts`) already rotates through the
  catalog, re-fetching TMDB details for up to 25 titles a day - but only titles untouched for 30+
  days, so today each title is refreshed about once a month. It gets providers from the same call
  and writes them, at no extra request. Monthly is too stale for availability; the proposal is to
  lower that threshold to 7 days and raise the batch to ~45, which refreshes the ~370 titles about
  every 8 days. The free plan caps one invocation at 50 outbound fetches and the cron shares them, so
  PR 1 measures the run's actual fetch count before settling the number (see "Decisions needed"). The cron heartbeat's existing
  `titles_refreshed` count covers it.
- **Backfill:** the existing titles fill in through that rotation within a week, or at once
  through a one-off admin endpoint on the ingest worker (CLAUDE.md #9: never on the public api),
  paged at 40 titles per call to stay under the fetch cap. TMDB calls only, no neurons.
- **Failure:** a provider fetch that fails leaves the previous rows and `checked_at` as they were.
  Stale data with an honest date beats no data ("degrade, don't fail", CLAUDE.md #8).

### API

`GET /titles/:id` gains `watch`, for the requested region (`?region=US`, default `US`):

```json
"watch": {
  "region": "US",
  "checkedAt": "2026-10-13T08:00:00Z",
  "link": "https://www.themoviedb.org/movie/417741/watch?locale=US",
  "stream": [{ "name": "Criterion Channel", "logo": "/abc.jpg" }],
  "free": [{ "name": "Kanopy", "logo": "/def.jpg" }],
  "rent": [],
  "buy": [{ "name": "Apple TV", "logo": "/ghi.jpg" }]
}
```

`watch` is `null` when the title has never been checked, which is different from checked with
every list empty. The zod schema in packages/core and `docs/API.md` describe both. Adding this to
`/search` results is out of scope: the cards don't need it, and it would widen every search query.

### Web

A **Where to watch** section on the title page, between "Why it matters" and "Synopsis":

- Three groups, **Stream**, **Free** and **Rent or buy**, each a row of provider logos with names
  (logo with visible text, not logo alone). Empty groups are hidden.
- **Free** is first when it has entries.
- When every group is empty: "Not currently available to stream, rent or buy in the US."
- Footer: "Checked {relative date} · See all options on TMDB ↗ · Availability data from JustWatch".
- Logos load from `image.tmdb.org` at a fixed small size. That means adding the host to
  `next.config.mjs`'s `remotePatterns` (posters are mirrored to R2; mirroring ~100 tiny logos isn't
  worth it, but it's a decision below).

### Region

Phase 1 shows **US** only, which matches the api default and the site's English UI. The data for the
other stored regions is there from day one, so a region selector (or reading the visitor's country
from Cloudflare's `cf.country`) is a web-only change later.

## Security

- **Third-party data is untrusted input.** Provider names render as text, never HTML. A logo path
  is used only if it matches `^/[A-Za-z0-9_-]+\.(jpg|png|svg)$` and is joined to a fixed host; the
  `link` is used only if it's `https://www.themoviedb.org/`. Anything else is dropped at ingest,
  not just at render.
- No new secrets: it uses the existing `TMDB_API_KEY` on the ingest worker. No new public
  endpoints that do work: the api only reads D1. The backfill is admin-only (CLAUDE.md #9).
- External links use `rel="noopener noreferrer"`, like #328.

## Cost

| | |
|---|---|
| Neurons | 0 - no model anywhere |
| TMDB requests | 0 extra at ingest and refresh (appended to the existing call); the one-off backfill is ~370 calls |
| D1 writes | ~7k rows at backfill, then ~45 titles' rows per day |
| KV writes | 0 (CLAUDE.md #2: the search cache already uses the 1,000/day) |

## How it's measured

There's no model, so no eval. The checks are about data quality:

- **Coverage:** the share of titles with at least one US option, reported on the api's
  `GET /titles/facets` or the Eval page. Expect it to be well under 100%, and that number is itself
  worth showing.
- **Accuracy spot-check before launch:** compare 10 titles against JustWatch's site by hand,
  including at least two library-only titles. Ship if nine of ten match.
- **Freshness:** the oldest `checked_at` across the catalog, which the rotation should keep under
  ~8 days.

## Plan

1. **Ingest + migration:** append `watch/providers`, normalize, persist, refresh in the cron
   rotation. Tests: a fixture-backed normalize test (all five TMDB categories, a region not in
   `WATCH_REGIONS`, a bad logo path), and a D1 spec for replace-on-refresh and "checked, none".
2. **Backfill:** the admin endpoint, run once in pages of 40. Spot-check against JustWatch.
3. **API:** the `watch` field, zod schema, `docs/API.md`, workerd tests for null vs empty.
4. **Web:** the section, empty state, attribution, About line, and `remotePatterns`. Add the
   section to `smoke-web.ts`.
5. **Later:** a "free to stream" filter (lexical/SQL first; the semantic path would need the field
   in Vectorize metadata and a vector rebuild), a region selector, and an MCP tool. A new MCP tool
   means re-running the tool-selection eval (~1.9k neurons, the day's 70B slot).

Each PR stands alone: after PR 1 the data is collected but not shown; after PR 3 it's in the api
for the MCP server and anyone else; PR 4 shows it.

## Decisions needed

1. **Regions to store.** Proposed: `US`, `MX`, `ES` (the US audience, and the two largest
   Spanish-language markets), adding more later at no fetch cost. Showing them is a separate, later
   decision.
2. **Refresh cadence.** About weekly (proposed: 7-day threshold, ~45 titles a day, every ~8 days) or leave the popularity
   rotation as is (30-day threshold, 25 a day, so availability can be a month old). Weekly also
   refreshes popularity more often, which nothing depends on.
3. **Logos:** load from `image.tmdb.org` (simple; one more image host) or mirror to R2 like posters
   (no third-party request from the reader's browser, more code).
4. **Where "Free" sits:** first (proposed, because library and free options are the most useful
   answer for this catalog) or in TMDB's order.
