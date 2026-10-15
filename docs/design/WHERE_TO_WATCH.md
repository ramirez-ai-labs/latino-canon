# Where to watch: US streaming, free, ads and rent/buy availability per title

**Status:** Proposed (2026-10-13), revised 2026-10-15. Nothing here is built. Section "Decisions"
records what's settled and the two choices still open.

## Why

A title page answers "what is this and why does it matter", and then stops. The next thing a reader
asks is *where can I watch it?* - can I stream it, is it free anywhere, can I rent or buy it. Today
the site can't answer, so the reader has to leave to find out.

That question is sharper for this catalog than for a streaming service's own. Much of the canon is
festival and archival Latin American cinema (*Araya*, *Limite*, *Hamaca paraguaya*, *La Ciénaga*),
which tends to be scattered across niche services or not streaming at all, and library apps (Kanopy,
Hoopla) carry a lot of this kind of film - free with a library card, and invisible to anyone who
doesn't know to look. "Free with your library card" is the most useful answer this feature can give,
and the most on-mission.

## Goals and non-goals

**Goals**

- Show, per title, where it's available **in the US**, in TMDB's five groups: **Stream**
  (subscription), **Free**, **Ads** (free with ads), **Rent** and **Buy**.
- Say plainly when a title isn't available anywhere in the US. That's an answer, not an error.
- Send readers who want another country, or want to see only their own services, to **TMDB's watch
  page**, which already does both (a country dropdown and per-account subscribed services).
- Show how current the data is ("Checked 3 days ago").
- **$0 and zero neurons**, within the free tier (CLAUDE.md #1, #2). No model is involved anywhere.

**Non-goals**

- **Region selection and service filtering on this site.** TMDB's watch page does both well, and
  rebuilding them here would mean storing every region, a country picker, a per-viewer services
  setting, and a provider list per region - all to duplicate a page one click away. The section
  links there instead (see "Web").
- Prices, or the SD/HD and "best price" views TMDB shows. Prices aren't in TMDB's API; they come
  from JustWatch's own data.
- Deep links into a provider's app. TMDB doesn't supply them (see "Data source").
- Any source other than legitimate providers. "Can I download it" is answered with rent, buy and
  library options, never piracy sites.
- Real-time accuracy. Availability changes weekly; a few days' lag is acceptable if it's labeled.
- A search filter ("free to stream"). It's PR 5, after the data has proven reliable (see "Plan").

## Data source: TMDB watch providers (JustWatch)

TMDB's `watch/providers` data, which TMDB sources from JustWatch, gives per country:

- `flatrate` (subscription), `free`, `ads`, `rent`, `buy` - each a list of providers with a name,
  logo path, provider id and display priority.
- `link` - TMDB's watch page for the title in that region, which links out to the providers and
  carries TMDB's own country dropdown.

Why this source:

- **We already call TMDB for every title**, with a pinned id (CRITERIA.md rule 10), so matching is
  exact. No fuzzy title search.
- **It costs no extra request.** `fetchTmdbDetails` (`apps/ingest/src/sources/tmdb.ts`) already uses
  `append_to_response=credits,external_ids`; adding `watch/providers` to that list returns the
  availability in the same response. This matters because the free plan caps a Worker invocation's
  outbound fetches (50), and the daily cron already spends them on the queue and the popularity refresh.
- The response holds every country; ingest keeps **only `results.US`** and drops the rest.

Terms to honor:

- **Attribution to JustWatch is required** wherever the data appears: "Availability data from
  JustWatch", next to the section, plus a line in About's "Data sources" (added in #328).
- **No deep links.** The section links to TMDB's `link`, which is where TMDB's terms send readers.

## Design

### Data model (migration `0031_watch_providers.sql`)

```sql
-- US only: one row per title, provider and category.
CREATE TABLE watch_providers (
  title_id TEXT NOT NULL REFERENCES titles(id),
  category TEXT NOT NULL,          -- 'stream' | 'free' | 'ads' | 'rent' | 'buy'
  provider_id INTEGER NOT NULL,    -- TMDB's provider id
  provider_name TEXT NOT NULL,
  logo_path TEXT,                  -- TMDB image path, e.g. '/abc.jpg'
  display_priority INTEGER NOT NULL,
  PRIMARY KEY (title_id, category, provider_id)
);

-- Per title: when it was checked, and TMDB's US watch page.
-- A row with no providers is how "checked, available nowhere" is stored.
CREATE TABLE watch_availability (
  title_id TEXT PRIMARY KEY REFERENCES titles(id),
  tmdb_link TEXT,
  checked_at TEXT NOT NULL
);
```

The categories are TMDB's (`flatrate` stored as `stream`), so the page reads the way TMDB's watch
page does. There's no `region` column: the feature is US-only by decision, not by default, and a
column nothing varies would only invite code paths nothing tests. If a second region is ever wanted,
that migration adds the column with a `'US'` default.

With ~390 titles and ~6 US providers each, that's ~2.5k rows - far under D1's free limits.

### Ingest

- **At ingest:** `fetchTmdbDetails` appends `watch/providers`; `normalize.ts` maps `results.US` to
  the rows above; `persist.ts` replaces the title's rows in one batch (delete + insert), together
  with its `watch_availability` row. A response with no `US` key is stored as checked, available
  nowhere.
- **Refresh:** the daily cron's `refreshPopularity` (`maintenance.ts`) already rotates through the
  catalog, re-fetching TMDB details for up to 25 titles a day - but only titles untouched for 30+
  days, so today each title is refreshed about once a month. It gets providers from the same call
  and writes them, at no extra request. Monthly is too stale for availability; the proposal is to
  lower that threshold to 7 days and raise the batch to ~45, which refreshes ~390 titles about
  every 9 days. The free plan caps one invocation at 50 outbound fetches and the cron shares them, so
  PR 1 measures the run's actual fetch count before settling the number. The cron heartbeat's
  existing `titles_refreshed` count covers it.
- **Backfill:** the existing titles fill in through that rotation within about nine days, or at once
  through a one-off admin endpoint on the ingest worker (CLAUDE.md #9: never on the public api),
  paged at 40 titles per call to stay under the fetch cap. TMDB calls only, no neurons.
- **Failure:** a provider fetch that fails leaves the previous rows and `checked_at` as they were.
  Stale data with an honest date beats no data ("degrade, don't fail", CLAUDE.md #8).

### API

`GET /titles/:id` gains `watch`. There's no `region` parameter:

```json
"watch": {
  "region": "US",
  "checkedAt": "2026-10-13T08:00:00Z",
  "link": "https://www.themoviedb.org/movie/1902-abre-los-ojos/watch?locale=US",
  "stream": [{ "name": "HBO Max", "logo": "/abc.jpg" }],
  "free": [{ "name": "Kanopy", "logo": "/def.jpg" }],
  "ads": [{ "name": "Tubi", "logo": "/ghi.jpg" }],
  "rent": [],
  "buy": []
}
```

`region` is a constant `"US"`, there so a client never has to assume it. `watch` is `null` when the
title has never been checked, which is different from checked with every list empty. The zod schema
in packages/core and `docs/API.md` describe both. Adding this to `/search` results is out of scope:
the cards don't need it, and it would widen every search query. `/titles/:id` isn't KV-cached
(`routes/titles.ts`), so the field adds no KV writes.

### Web

A **Where to watch in the US** section on the title page, between "Why it matters" and "Synopsis",
laid out like TMDB's watch page:

- Five groups in TMDB's order, **Stream**, **Free**, **Ads**, **Rent**, **Buy**, each a row of
  provider logos with names (logo with visible text, not logo alone). Empty groups are hidden.
- When every group is empty: "Not currently available to stream, rent or buy in the US."
- **Another country, or only your services:** "See other countries and your services on TMDB ↗",
  linking to TMDB's watch page for the title. That page has TMDB's country dropdown and its
  subscribed-services setting; the site builds neither.
- Footer: "Checked {relative date} · Availability data from JustWatch".
- Logos load from `image.tmdb.org` at a fixed small size. That means adding the host to
  `next.config.mjs`'s `remotePatterns` (posters are mirrored to R2; mirroring ~100 tiny logos isn't
  worth it, but it's a decision below).

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
| TMDB requests | 0 extra at ingest and refresh (appended to the existing call); the one-off backfill is ~390 calls |
| D1 writes | ~2.5k rows at backfill, then ~45 titles' rows per day |
| KV writes | 0 (CLAUDE.md #2: the search cache already uses the 1,000/day) |

## How it's measured

There's no model, so no eval. The checks are about data quality:

- **Coverage:** the share of titles with at least one US option, reported on the api's
  `GET /titles/facets` or the Eval page. Expect it to be well under 100%, and that number is itself
  worth showing.
- **Accuracy spot-check before launch:** compare 10 titles against TMDB's US watch page by hand,
  including at least two library-only titles. Ship if nine of ten match.
- **Freshness:** the oldest `checked_at` across the catalog, which the rotation should keep under
  ~9 days.

## Plan

1. **Ingest + migration:** append `watch/providers`, normalize `results.US`, persist, refresh in the
   cron rotation. Tests: a fixture-backed normalize test (all five TMDB categories, a response with
   no `US` key, a bad logo path), and a D1 spec for replace-on-refresh and "checked, none".
2. **Backfill:** the admin endpoint, run once in pages of 40. Spot-check against TMDB.
3. **API:** the `watch` field, zod schema, `docs/API.md`, workerd tests for null vs empty.
4. **Web:** the section, empty state, TMDB link, attribution, About line, and `remotePatterns`. Add
   the section to `smoke-web.ts`.
5. **Later:** a "free to stream in the US" filter (lexical/SQL first; the semantic path would need
   the field in Vectorize metadata and a vector rebuild) and an MCP tool. A new MCP tool means
   re-running the tool-selection eval (~1.9k neurons, the day's 70B slot).

Each PR stands alone: after PR 1 the data is collected but not shown; after PR 3 it's in the api
for the MCP server and anyone else; PR 4 shows it.

## Decisions

**Settled (2026-10-15):**

1. **US only.** The site stores and shows US availability; there's no region selection or service
   filtering. Readers who want another country or only their own services use TMDB's watch page,
   linked from the section, which has both.
2. **TMDB's groups and order:** Stream, Free, Ads, Rent, Buy. Free and Ads stay separate, as on
   TMDB - "free" and "free with ads" are different offers.

**Still open:**

3. **Refresh cadence.** About weekly (proposed: 7-day threshold, ~45 titles a day, every ~9 days) or
   leave the popularity rotation as is (30-day threshold, 25 a day, so availability can be a month
   old). Weekly also refreshes popularity more often, which nothing depends on.
4. **Logos:** load from `image.tmdb.org` (simple; one more image host) or mirror to R2 like posters
   (no third-party request from the reader's browser, more code).
