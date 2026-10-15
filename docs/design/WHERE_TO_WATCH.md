# Where to watch: a link to TMDB's watch page, shown when the US has offers

**Status:** Proposed (2026-10-13), revised 2026-10-15. Nothing here is built. The decisions are
settled (see "Decisions").

## Why

A title page answers "what is this and why does it matter", and then stops. The next thing a reader
asks is *where can I watch it?* Today the site can't answer, so the reader has to leave and search.

TMDB already answers it well. Its watch page for a title (`/movie/1902/watch`) lists every offer -
stream, free, ads, rent, buy - with a country dropdown and the reader's subscribed services, from
JustWatch's data. The site doesn't need to rebuild any of that. It needs to send the reader there,
and not send them there for nothing.

## Goals and non-goals

**Goals**

- A **Where to watch ↗** link on the title page to TMDB's watch page, opening on the US.
- **No dead ends.** For a title with no US offers, TMDB's watch page says "There are no offers for
  …" (checked on *Bound by Honor*, TMDB 9702). The site says that itself instead of linking to it.
- Say how current that answer is ("Checked Oct 2026").
- **$0 and zero neurons**, within the free tier (CLAUDE.md #1, #2). No model anywhere, no extra
  TMDB request.

**Non-goals**

- Showing providers, logos or offer types on the site. TMDB's page does it, with a country dropdown
  and subscribed services; duplicating it means storing provider lists for every region, hosting
  logos and keeping both fresh.
- Region selection or service filtering on the site. Readers choose a country and services on TMDB.
- Prices and deep links into provider apps. Neither is in TMDB's API.
- Real-time accuracy. A monthly refresh is enough for a yes/no answer, as long as it's dated.

## How we know whether a title has offers

TMDB hides the "Where to Watch" block on a title's page when there are no offers, but its watch page
always exists - it loads and says "There are no offers". So the URL can't tell us, and TMDB answers
scripted requests for its web pages with `403` anyway.

The signal is TMDB's API: `watch/providers` returns `results` keyed by country code. A title has US
offers when `results.US` exists (with any of `flatrate`, `free`, `ads`, `rent`, `buy`), and has
offers somewhere when `results` has any key.

That data comes free on the call ingest already makes: `fetchTmdbDetails`
(`apps/ingest/src/sources/tmdb.ts`) uses `append_to_response=credits,external_ids`, and adding
`watch/providers` returns it in the same response. No extra request, which matters because the free
plan caps a Worker invocation at 50 outbound fetches and the daily cron already spends them.

## Design

### Data (migration `0031_watch_flags.sql`)

Two flags and a date on `titles`:

```sql
-- 1 = TMDB lists at least one US offer, 0 = none, NULL = not checked yet.
ALTER TABLE titles ADD COLUMN watch_us INTEGER;
-- 1 = TMDB lists offers in at least one country, 0 = none anywhere, NULL = not checked yet.
ALTER TABLE titles ADD COLUMN watch_anywhere INTEGER;
-- When the flags were last set from TMDB.
ALTER TABLE titles ADD COLUMN watch_checked_at TEXT;
```

No provider tables. The flags are all the page needs.

### Ingest

- **At ingest:** `fetchTmdbDetails` appends `watch/providers` and returns `watchUs` and
  `watchAnywhere`; `persist.ts` writes them with `watch_checked_at`.
- **Refresh:** the daily cron's `refreshPopularity` (`maintenance.ts`) already re-fetches TMDB
  details for 25 titles a day, oldest first, each title about once a month. It writes the two
  flags in the same `UPDATE` as popularity, at no extra request. Existing titles fill in through
  this rotation, so there's no backfill: about 390 titles at 25 a day is about 16 days.
- **Failure:** a fetch that fails leaves the flags and date as they were (CLAUDE.md #8, "degrade,
  don't fail"). The response's watch block missing entirely is treated as a failure, not as "no
  offers", so a TMDB hiccup can't hide a link.

### API

`GET /titles/:id` gains `watch`:

```json
"watch": { "us": false, "anywhere": true, "checkedAt": "2026-10-20T08:00:00Z" }
```

`watch` is `null` until the title is first checked. The zod schema in packages/core and
`docs/API.md` describe it. `/titles/:id` isn't KV-cached (`routes/titles.ts`), so this adds no KV
writes. Not added to `/search` results: cards don't show it.

### Web

On the title page, near the title and year:

| `watch` | Shown |
|---|---|
| `us: true` | **Where to watch ↗** |
| `us: false, anywhere: true` | "Not available in the US right now. **See other countries on TMDB ↗**" |
| `us: false, anywhere: false` | "Not available to stream, rent or buy right now." |
| `null` (not checked yet) | **Where to watch ↗** - TMDB's page answers either way |

The "not available" lines end with "Checked {Mon YYYY}".

The link is built from fields the page already has, the same `/tv` vs `/movie` split
`lib/source-links.ts` uses:

```
https://www.themoviedb.org/{tv|movie}/{tmdbId}/watch?locale=US
```

`locale=US` opens TMDB's page on the US; the reader changes the country or services there.
`/movie/9702/watch` redirects to the slugged URL, so the site doesn't need TMDB's slug. The
"other countries" link is the same URL, since the dropdown is on that page. External links use
`rel="noopener noreferrer"`, like #328.

Attribution: the site shows no JustWatch data, only a yes/no derived from TMDB, so the existing
TMDB credit on About (#328) covers it. TMDB's own page credits JustWatch.

## Security

- The only third-party values stored are two integers derived in code, not strings from TMDB, so
  there's nothing to sanitize or allowlist.
- The link is built from our own `tmdbId` and `kind` to a fixed host.
- No new secrets (it uses the existing `TMDB_API_KEY` on ingest), no new endpoints.

## Cost

| | |
|---|---|
| Neurons | 0 |
| TMDB requests | 0 extra (appended to the existing ingest and refresh calls) |
| D1 writes | 0 extra rows; three more columns on the existing per-title update |
| KV writes | 0 |

## How it's measured

- **Coverage:** the share of titles with `watch_us = 1`, worth showing on the Eval page. Expect it
  to be well under 100% for this catalog.
- **Accuracy spot-check before launch:** compare 10 titles' flags against TMDB's watch pages by hand,
  including *Bound by Honor* (no US offers) and *Abre los ojos* (offers). Ship if all 10 match;
  there's no judgment in a yes/no.

## Plan

1. **Ingest + migration:** append `watch/providers`, derive the flags, write them at ingest and in
   `refreshPopularity`. Tests: a fixture-backed test for US offers, offers elsewhere only, none
   anywhere, and a response missing the watch block (flags unchanged); a D1 spec for the refresh
   write.
2. **API:** the `watch` field, zod schema, `docs/API.md`, a workerd test for `null` vs checked.
3. **Web:** the link and the "not available" states, and a check in `smoke-web.ts` that the title
   page links to `themoviedb.org/…/watch`.
4. **Later:** a "streaming in the US" filter on search, from `watch_us`; and `watch` in the MCP
   server's `get_title` output. Changing the MCP tool means re-running the tool-selection eval
   (~1.9k neurons, the day's 70B slot).

## Decisions

Settled 2026-10-15:

1. **A link, not a provider list.** Readers pick a country and services on TMDB's watch page.
2. **The link opens on the US** (`locale=US`), and shows only when TMDB lists US offers or the title
   hasn't been checked yet.
3. **Two flags:** US offers, and offers anywhere, so a title available only abroad points to TMDB's
   other countries instead of a dead end.
4. **Monthly refresh:** the existing rotation, unchanged. A dated yes/no doesn't need weekly
   freshness, and it keeps the cron's fetch budget as it is.
