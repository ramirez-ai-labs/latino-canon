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
