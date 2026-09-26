import type { BlurbSource } from "./types.js";

/**
 * Blurb citations: the blurb model cites sources inline as `[s1]` (synopsis) / `[d0]`,
 * `[d1]`... (director credits) - the ids apps/ingest's blurbForIngest assigns.
 *
 * Until blurb-grounding-integrity, ingest stored only {kind, ref, quote: null} per source
 * - no id, no text. Two things broke on that: the groundedness judge scored each blurb
 * against `quote ?? ref`, i.e. a title slug and a director's name, never the synopsis
 * (every recorded groundedness run up to then measured nothing); and the UI couldn't map
 * `[d0]` back to a source, so raw markers showed on cards. Rows written since carry
 * `id` + `text`; older ones are rebuilt here from the same inputs ingest used.
 */
export interface ResolvedBlurbSource extends BlurbSource {
  id: string;
  text: string;
}

/**
 * Give every source an id matching what the blurb cites, and the text the blurb model
 * actually saw. Legacy rows are rebuilt the same way blurbForIngest built them: the
 * synopsis source (if any) first as "s1", then one "Directed by X." credit per director
 * as d0, d1, ... in stored order.
 */
export function resolveBlurbSources(sources: BlurbSource[], title: { synopsis: string | null }): ResolvedBlurbSource[] {
  let directorIndex = 0;
  return sources.map((s) => {
    if (s.id && s.text) return { ...s, id: s.id, text: s.text };
    if (s.kind === "synopsis") return { ...s, id: s.id ?? "s1", text: s.text ?? title.synopsis ?? "" };
    if (s.kind === "credit") {
      const id = s.id ?? `d${directorIndex}`;
      directorIndex++;
      return { ...s, id, text: s.text ?? `Directed by ${s.ref}.` };
    }
    return { ...s, id: s.id ?? s.ref, text: s.text ?? s.quote ?? s.ref };
  });
}

// One marker may cite several sources: "[d0, d1]" (seen live on Valley of the Dead).
const CITATION_RE = /\s*\[([a-z]\d+(?:\s*,\s*[a-z]\d+)*)\]/g;

/** Blurb text without inline citation markers - for teasers and anywhere footnotes can't render. */
export function stripCitations(text: string): string {
  return text.replace(CITATION_RE, "");
}

// Found live (2026-09-26, the first judge-gated batch): 7 of 12 auto-approved blurbs named
// their sources in the prose - "according to s1", "says a1", "according to OMDb",
// "according to [s1]". Every claim was still sourced, so the groundedness judge passed
// them, but readers saw raw ids and card teasers (stripCitations) read "according to ."
// The judge measures support, not presentation; this is the presentation check.
const BARE_SOURCE_ID_RE = /\b[a-z]\d{1,2}\b/;
const NAMES_A_SOURCE_RE = /\baccording to\b|\bas (?:stated|noted|reported|listed) (?:in|by)\b|\b(?:OMDb|TMDB|IMDb)\b|\bthe (?:synopsis|source)\b/i;

/**
 * What a reader would see wrong in a blurb that citation markers can't fix. Empty means
 * clean. A false positive only leaves a blurb for an editor, so the checks lean strict.
 */
export function blurbTextProblems(text: string): string[] {
  const prose = stripCitations(text);
  const problems: string[] = [];
  if (BARE_SOURCE_ID_RE.test(prose)) problems.push("bare source id");
  if (NAMES_A_SOURCE_RE.test(prose)) problems.push("names its source");
  return problems;
}

/** Split blurb text into plain segments and cited source ids, in order, for footnote rendering. */
export function splitCitations(text: string): ({ text: string } | { cite: string })[] {
  const parts: ({ text: string } | { cite: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(CITATION_RE)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    for (const id of m[1]!.split(/\s*,\s*/)) parts.push({ cite: id });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
