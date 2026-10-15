import type { Title } from "./types.js";

/**
 * Where to watch (docs/design/WHERE_TO_WATCH.md): the site links to TMDB's watch page
 * instead of listing offers itself. That page has every offer type, a country dropdown and
 * the reader's subscribed services, from JustWatch's data.
 *
 * `locale=US` opens it on the US. TMDB redirects /movie/{id}/watch to the slugged URL, so
 * the id is enough. Same /tv vs /movie split as ingest's fetch (sources/tmdb.ts): a
 * special is a movie on TMDB.
 */
export function tmdbWatchUrl(title: Pick<Title, "kind" | "tmdbId">): string | null {
  if (!title.tmdbId) return null;
  return `https://www.themoviedb.org/${title.kind === "series" ? "tv" : "movie"}/${title.tmdbId}/watch?locale=US`;
}

/**
 * What the title page shows:
 * - `link`: US offers, or not checked yet (TMDB's page answers either way).
 * - `elsewhere`: no US offers, but offers in another country - link to pick one on TMDB.
 * - `nowhere`: no offers anywhere - say so rather than link to "There are no offers".
 * - `none`: no TMDB id, so nothing to link to.
 *
 * `watch` is optional on the input because a web build can briefly run against an api
 * deployed before the field existed; missing reads as not checked.
 */
export type WatchState =
  | { kind: "link"; href: string }
  | { kind: "elsewhere"; href: string; checkedAt: string }
  | { kind: "nowhere"; checkedAt: string }
  | { kind: "none" };

export function watchState(title: Pick<Title, "kind" | "tmdbId"> & { watch?: Title["watch"] }): WatchState {
  const href = tmdbWatchUrl(title);
  if (!href) return { kind: "none" };
  const w = title.watch;
  if (!w || w.us) return { kind: "link", href };
  if (w.anywhere) return { kind: "elsewhere", href, checkedAt: w.checkedAt };
  return { kind: "nowhere", checkedAt: w.checkedAt };
}
