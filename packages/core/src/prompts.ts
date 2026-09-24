import { GENRES, INCLUSION_TYPE_DEFINITIONS, THEME_LABELS } from "./taxonomy.js";

const inclusionBlock = Object.entries(INCLUSION_TYPE_DEFINITIONS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n");

const themeList = Object.entries(THEME_LABELS)
  .map(([k, v]) => `${k} (${v})`)
  .join(", ");

const genreList = GENRES.join(", ");

/**
 * Query rewriting: natural language -> cleaned lexical query + structured filters.
 * Runtime call. Keep it cheap; a rules fallback (apps/api/src/ai/rewrite-query.ts)
 * covers the common cases when the LLM budget is exhausted.
 */
export const QUERY_REWRITE_SYSTEM = `You convert a movie/TV search phrase into a cleaned keyword query plus structured filters.

Filters you may set (all optional):
- kind: "film" | "series" | "special" (a stand-up comedy special)
- decade: a year like 1990 (the START of the decade)
- country: ISO 3166-1 alpha-2 (e.g. MX, US, CL) - the country that PRODUCED the work. Only set it
  when the phrase names a production origin ("made in Argentina", "Mexican cinema industry").
  Never infer it from the language the phrase is written in, or from a heritage word describing
  characters ("Mexican family", "Cuban-American") - most titles here are US productions.
- theme: one of ${themeList}
- inclusionType: led_by | created_by | about_community | breakthrough
- genre: one of ${genreList} (a format/style tag - "animation", "documentary" - distinct from theme)
- contentAdvisory: "general" (family/kids-appropriate) - only set this when the phrase explicitly
  asks for something suitable for children/family viewing (e.g. "for kids", "family movie night").
  Never infer it from a plot detail like a child character - that describes the story, not who
  should watch it. Never set "mature" - that's assigned during classification, not requested by a search.

Rules:
- cleanedQuery keeps only the semantic content (people, plot words). Strip words you moved into filters.
- If a word doesn't map to any filter above, keep it in cleanedQuery rather than dropping it - it
  still helps keyword/semantic matching even without a structured filter to attach it to.
- If the phrase names no filter, return empty filters and the phrase unchanged.
- rationale: one sentence, <= 30 words.
Respond ONLY with JSON matching: {"cleanedQuery": string, "filters": object, "rationale": string}`;

export function queryRewriteUser(phrase: string): string {
  return `Phrase: "${phrase}"`;
}

/**
 * Zero-shot inclusion + theme classification. Offline batch call during ingestion.
 */
export const CLASSIFY_SYSTEM = `You tag a film or TV series for a catalog of Latino-focused cinema and television.

CURATION GATE: REJECT adult/pornographic content. If the synopsis, cast, or title suggest sexual/adult content,
return {"inclusionTypes":[],"note":"Adult content excluded per curation policy"} and nothing else.

inclusion_type (assign every one that applies, with a 0-1 confidence):
${inclusionBlock}

themes (assign up to 6 that are clearly present, with a 0-1 confidence): ${themeList}

Base your answer ONLY on the provided metadata. If nothing supports any inclusion_type,
return an empty inclusionTypes array and explain briefly in "note" - at most one short
sentence, under 200 characters. Omit "note" entirely otherwise; don't restate your
reasoning for a non-empty inclusionTypes array.
Respond ONLY with JSON matching:
{"inclusionTypes":[{"type":string,"confidence":number}],"themes":[{"theme":string,"confidence":number}],"note":string?}`;

export function classifyUser(input: {
  title: string;
  year: number;
  synopsis: string | null;
  directors: string[];
  creators: string[];
  writers: string[];
  topCast: string[];
  countries: string[];
}): string {
  return JSON.stringify(input, null, 2);
}

/**
 * A softer, separate judgment from CLASSIFY_SYSTEM's curation gate (which rejects
 * hardcore adult/pornographic content outright): this is for content that legitimately
 * belongs in the canon but carries mature themes that shouldn't rank for a family/kids-
 * audience search - explicit sexuality, drug trafficking, graphic violence. A plot
 * detail alone (a child character, a family setting) never implies "general" on its
 * own; judge the actual content, not who the story is about.
 */
export const CONTENT_ADVISORY_SYSTEM = `You judge whether a film/TV synopsis describes content suitable for a general
audience (including children/family viewing) or content carrying mature themes.

Rate "mature" if the synopsis describes or clearly implies: explicit sexual content, drug
trafficking or hard drug use, graphic violence, or similarly adult subject matter. Rate
"general" otherwise - most family dramas, comedies, and coming-of-age stories are
"general" even when they deal with serious topics like immigration or poverty; those
aren't the same thing as mature content.

A synopsis mentioning a child or family setting is NOT by itself evidence of "general" -
judge the actual content described, not who the story is about.

Base your answer ONLY on the provided synopsis.
Respond ONLY with JSON matching: {"rating": "general" | "mature", "rationale": string}`;

export function contentAdvisoryUser(input: { title: string; year: number; synopsis: string | null }): string {
  return JSON.stringify(input, null, 2);
}

/**
 * "Why it matters" blurb. RAG: the caller supplies grounding snippets, each with an id.
 * Every sentence in the blurb must map to a snippet id via "claims".
 */
export const BLURB_SYSTEM = `You write a 2-3 sentence "why it matters" note for a title in a Latino film canon.

Constraints:
- Ground every claim in the supplied SOURCES. Do not add facts that are not in a source.
- No hype adjectives ("stunning", "must-see"). State what the work is and its significance.
- "text" must be 40-360 characters - both bounds are hard requirements. Two sentences is
  usually enough to state what the work is and why it matters. Add a second sentence only
  if a single clause would be under 40 characters; do not add a third sentence "for
  completeness" once two already cover it - that is the most common way past 360.
- For each factual claim, cite the source id it rests on.
Respond ONLY with JSON matching:
{"text": string, "claims":[{"claim": string, "supportedBy": string}]}`;

export function blurbUser(sources: { id: string; kind: string; text: string }[]): string {
  return [
    "SOURCES:",
    ...sources.map((s) => `[${s.id}] (${s.kind}) ${s.text}`),
  ].join("\n");
}

/**
 * Bump when a judge change makes new groundedness scores incomparable with old ones; the
 * Eval page labels runs recorded below it as invalid. 2 = the judge sees each source's
 * real text (it was given a title slug + director name before) at temperature 0.
 */
export const GROUNDEDNESS_JUDGE_VERSION = 2;

/** LLM-as-judge for the eval harness. */
export const GROUNDEDNESS_JUDGE_SYSTEM = `You score whether a blurb is fully supported by its sources.
Return JSON {"score": number (0-1), "unsupported": string[]} where "unsupported" lists any
claim in the blurb not backed by a source. 1.0 = every claim supported.
Respond with ONLY the JSON object - no explanation, no markdown fences, no other text.`;
