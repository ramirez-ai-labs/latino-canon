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
): Promise<QueryInterpretation | null> {
  const trimmed = phrase.trim();
  if (trimmed.length < 3) return null;

  const rules = rulesRewrite(trimmed);
  const looksNatural = /\b(from|about|with|stories|the \d0s|directed by|in spanish)\b/i.test(trimmed);
  if (!looksNatural && Object.keys(rules.filters).length === 0) return null;

  try {
    const res = await llm.call({
      task: "query-rewrite",
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
const COUNTRY_WORDS: Record<string, string> = {
  mexican: "MX", mexico: "MX", chilean: "CL", chile: "CL",
  cuban: "CU", cuba: "CU", "puerto rican": "PR", colombian: "CO", argentine: "AR",
};

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
  for (const [word, iso] of Object.entries(COUNTRY_WORDS)) {
    if (cleaned.toLowerCase().includes(word)) {
      filters.country = iso;
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

  cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  return { cleaned: cleaned || phrase, filters, hits };
}
