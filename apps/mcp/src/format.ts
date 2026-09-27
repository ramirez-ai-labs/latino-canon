import {
  INCLUSION_TYPE_LABELS,
  THEME_LABELS,
  stripCitations,
  type InclusionType,
  type RankedTitle,
  type Theme,
  type Title,
  type TitleCard,
} from "@latino-canon/core";

/**
 * Tool results are for a model to read and quote, not for a UI: drop scores, gender
 * fields, poster keys and ids a model can't use, keep what answers "what is it and why
 * is it in this canon", and give every title a link to its page so an answer can cite it.
 */

const years = (start: number, end: number | null) => (end && end !== start ? `${start}–${end}` : String(start));

export function titleUrl(webUrl: string, id: string): string {
  return `${webUrl}/title/${encodeURIComponent(id)}`;
}

export function cardSummary(card: TitleCard, webUrl: string) {
  return {
    id: card.id,
    title: card.title,
    year: years(card.yearStart, card.yearEnd),
    kind: card.kind,
    director: card.director,
    leadActor: card.leadActor,
    // Why it's in the canon, in the site's own words ("Latino-directed", "About the community").
    whyInCanon: card.inclusionTypes.map((t) => INCLUSION_TYPE_LABELS[t]),
    themes: card.themes.map((t) => THEME_LABELS[t]),
    genres: card.genres,
    blurb: card.blurbTeaser,
    url: titleUrl(webUrl, card.id),
  };
}

export function rankedSummary(r: RankedTitle, webUrl: string) {
  return { ...cardSummary(r.title, webUrl), reason: r.reason, matched: r.matchedCriteria };
}

const names = (t: Title, role: string, max: number) =>
  t.credits
    .filter((c) => c.role === role)
    .sort((a, b) => a.order - b.order)
    .slice(0, max)
    .map((c) => (role === "cast" && c.character ? `${c.person.name} (${c.character})` : c.person.name));

export function titleDetail(t: Title, webUrl: string) {
  const inclusion = t.tags.filter((g) => g.kind === "inclusion_type");
  return {
    id: t.id,
    title: t.title,
    originalTitle: t.originalTitle && t.originalTitle !== t.title ? t.originalTitle : undefined,
    year: years(t.yearStart, t.yearEnd),
    kind: t.kind,
    countries: t.country,
    runtimeMinutes: t.runtime ?? undefined,
    synopsis: t.synopsis,
    directors: names(t, "director", 4),
    creators: names(t, "creator", 4),
    writers: names(t, "writer", 4),
    cast: names(t, "cast", 8),
    whyInCanon: inclusion.map((g) => ({
      type: INCLUSION_TYPE_LABELS[g.slug as InclusionType] ?? g.label,
      // seed and editor tags are curated; model tags are the classifier's, with its confidence.
      source: g.source,
      ...(g.source === "model" ? { confidence: g.confidence } : {}),
    })),
    themes: t.tags.filter((g) => g.kind === "theme").map((g) => THEME_LABELS[g.slug as Theme] ?? g.label),
    genres: t.genres,
    contentAdvisory: t.contentAdvisory ?? undefined,
    oscarWin: t.oscarWin ?? undefined,
    // Only an approved blurb: an unapproved one hasn't passed the groundedness judge or
    // an editor, and the site doesn't show it either.
    whyItMatters:
      t.blurb?.approved
        ? {
            text: stripCitations(t.blurb.text),
            sources: t.blurb.sources.map((s) => ({ kind: s.kind, text: s.text ?? s.quote ?? s.ref })),
          }
        : undefined,
    context: t.contextNotes.length ? t.contextNotes.map((n) => n.summary) : undefined,
    url: titleUrl(webUrl, t.id),
  };
}
