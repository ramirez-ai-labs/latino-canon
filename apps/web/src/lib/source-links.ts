import type { BlurbSource, Title } from "@latino-canon/core";

export type SourceLink = { href: string; label: string };

/**
 * Where a cited source can be checked. A citation the reader can't follow back reads as
 * something the model made up - the "Sources" list used to print only the text it was
 * given ("16 wins & 5 nominations") with no way to verify it.
 *
 * Mirrors what ingest cites (apps/ingest/src/ai.ts blurbSources): the synopsis and the
 * director credits come from TMDB, awards from OMDb by IMDb id. Context-note sources
 * carry their own URL in `ref`. Only http(s) URLs are ever linked.
 */
export function sourceLink(source: BlurbSource, title: Pick<Title, "kind" | "tmdbId" | "imdbId" | "credits">): SourceLink | null {
  // Same /tv vs /movie split ingest uses to fetch the record (sources/tmdb.ts).
  const tmdbTitle = title.tmdbId
    ? `https://www.themoviedb.org/${title.kind === "series" ? "tv" : "movie"}/${title.tmdbId}`
    : null;

  switch (source.kind) {
    case "synopsis":
      return tmdbTitle ? { href: tmdbTitle, label: "TMDB" } : null;
    case "credit": {
      // A credit's ref is the person's name; link their TMDB page when we have its id.
      const person = title.credits.find(
        (c) => (c.role === "director" || c.role === "creator") && c.person.name === source.ref,
      )?.person;
      if (person?.tmdbId) return { href: `https://www.themoviedb.org/person/${person.tmdbId}`, label: "TMDB" };
      return tmdbTitle ? { href: `${tmdbTitle}/cast`, label: "TMDB" } : null;
    }
    case "award": {
      // OMDb reports IMDb's awards line, so IMDb's awards page is where it can be checked.
      const imdbId = /^tt\d+$/.test(source.ref) ? source.ref : title.imdbId;
      return imdbId && /^tt\d+$/.test(imdbId)
        ? { href: `https://www.imdb.com/title/${imdbId}/awards/`, label: "IMDb, via OMDb" }
        : null;
    }
    default:
      return externalUrl(source.ref);
  }
}

/** A ref that is itself a web address, labeled by its site. Anything else (javascript:, data:, plain text) isn't linked. */
function externalUrl(ref: string): SourceLink | null {
  try {
    const url = new URL(ref);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { href: url.toString(), label: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}
