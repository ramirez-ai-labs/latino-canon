import {
  QUERY_REWRITE_SYSTEM,
  queryRewriteUser,
  queryInterpretationSchema,
  extractJson,
  type LlmClient,
  type QueryInterpretation,
  type SearchFilters,
} from "@latino-canon/core";

/**
 * NL -> cleaned query + structured filters.
 *
 * Strategy: run the cheap rules pass first. If it already covers the phrase (or the
 * phrase is short/keyword-like), skip the LLM entirely. Otherwise ask the LLM and
 * fall back to the rules result on any error / budget exhaustion.
 */
export async function rewriteQuery(
  llm: LlmClient,
  phrase: string,
  caller: string = "search",
): Promise<QueryInterpretation | null> {
  const trimmed = phrase.trim();
  if (trimmed.length < 3) return null;

  const rules = rulesRewrite(trimmed);
  // Bilingual: this product advertises Spanish search on its own home page, but the
  // rules pass below never extracts a theme filter in either language - a natural
  // Spanish phrase like "peliculas de inmigración y fronteras" set no rules.filters
  // and matched none of these English-only connector words, so it short-circuited to
  // null and skipped the LLM call entirely (which - per QUERY_REWRITE_SYSTEM's own
  // prompt - already handles Spanish input fine). Found live: that exact query
  // returned an unranked 50-result dump with no interpretation at all. A handful of
  // Spanish connectors plus a length fallback (natural sentences run longer than
  // keyword searches in any language) catches this without enumerating every possible
  // Spanish phrasing.
  const looksNatural =
    /\b(from|about|with|stories|the \d0s|directed by|in spanish|de|sobre|con|pel[ií]culas?|historias|en español)\b/i.test(
      trimmed,
    ) || trimmed.split(/\s+/).length >= 4;
  if (!looksNatural && Object.keys(rules.filters).length === 0) return null;

  try {
    const res = await llm.call({
      task: "query-rewrite",
      caller,
      json: true,
      maxTokens: 200,
      messages: [
        { role: "system", content: QUERY_REWRITE_SYSTEM },
        { role: "user", content: queryRewriteUser(trimmed) },
      ],
    });
    const parsed = queryInterpretationSchema.parse(extractJson(res.text));
    return { ...parsed, source: "llm" };
  } catch (err) {
    console.warn("rewriteQuery LLM failed, using rules:", err);
    return rules.hits > 0 || Object.keys(rules.filters).length > 0
      ? { cleanedQuery: rules.cleaned, filters: rules.filters, rationale: "rule-based", source: "rules" }
      : null;
  }
}

const DECADE_RE = /\b((?:19|20)\d0|\d0)s?\b/;
const DECADE_WORDS: Record<string, number> = { nineties: 1990, eighties: 1980, seventies: 1970 };

// Bilingual synonyms for thematic expansion (Spanish ↔ English)
const SYNONYM_EXPANSIONS: Record<string, string[]> = {
  border: ["crossing", "immigration", "fronteras", "cruce", "migrante"],
  crossing: ["border", "immigration", "fronteras", "cruce"],
  immigration: ["border", "crossing", "migrants", "inmigración", "fronteras"],
  fronteras: ["border", "crossing", "immigration", "cruce"],
  family: ["familias", "community", "household"],
  familias: ["family", "community", "household"],
  love: ["romance", "amor", "passion", "corazón"],
  amor: ["love", "romance", "passion", "corazón"],
  crime: ["delito", "crimen", "corruption", "violence"],
  delito: ["crime", "crimen", "corruption", "violence"],
  music: ["música", "songs", "singer", "artist", "cantante"],
  música: ["music", "songs", "singer", "artist", "cantante"],
};

/**
 * No nationality/heritage-word -> country filter here (there was one; it's gone).
 * `country` on a Title is where the work was *produced* (ISO 3166-1), but this catalog
 * is overwhelmingly US-produced stories about other-country heritage — "Mexican family",
 * "Cuban-American" describe the characters/community, not the production's origin.
 * Confirmed live via packages/eval: that heuristic broke 2 of 15 golden queries (My
 * Family and One Day at a Time, both US-produced, both got window-shopped out by an
 * inferred country=MX/CU filter) and never once helped the other 13. Leave nationality
 * words in the free-text query for lexical/semantic matching instead of turning them
 * into a structured filter the rules layer can't get right.
 */
function rulesRewrite(phrase: string): {
  cleaned: string;
  filters: SearchFilters;
  hits: number;
} {
  let cleaned = phrase;
  const filters: SearchFilters = {};
  let hits = 0;

  const decade = phrase.match(DECADE_RE);
  if (decade?.[1]) {
    const decadeNumber = Number(decade[1]);
    filters.decade = decade[1].length === 2
      ? (decadeNumber >= 50 ? 1900 : 2000) + decadeNumber
      : decadeNumber;
    cleaned = cleaned.replace(DECADE_RE, "").trim();
    hits++;
  }
  for (const [word, year] of Object.entries(DECADE_WORDS)) {
    if (cleaned.toLowerCase().includes(word)) {
      filters.decade = year;
      cleaned = cleaned.replace(new RegExp(word, "i"), "").trim();
      hits++;
    }
  }
  if (/\bseries|tv|show\b/i.test(cleaned)) {
    filters.kind = "series";
    hits++;
  } else if (/\bfilms?|movies?\b/i.test(cleaned)) {
    filters.kind = "film";
    hits++;
  }

  // Bilingual synonym expansion: only for thematic queries (3+ words or explicit keywords)
  if (cleaned.split(/\s+/).length >= 3 || /\b(border|crossing|immigration|family|love|crime|music|fronteras|cruce|familias|amor|delito|música)\b/i.test(cleaned)) {
    cleaned = expandBilingualSynonyms(cleaned);
  }

  cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  return { cleaned: cleaned || phrase, filters, hits };
}

/**
 * Expand thematic synonyms for bilingual search. If query contains "border",
 * also search for "crossing", "immigration", "fronteras", etc.
 * This helps bridge Spanish/English vocabulary gaps in discovery queries.
 */
function expandBilingualSynonyms(phrase: string): string {
  const lowerPhrase = phrase.toLowerCase();
  const tokens = lowerPhrase.split(/\s+/);
  const expanded = new Set<string>(tokens);

  for (const token of tokens) {
    const synonyms = SYNONYM_EXPANSIONS[token];
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
  }

  return Array.from(expanded).join(" ");
}
