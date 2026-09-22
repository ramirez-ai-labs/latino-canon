import { makeLlmClient } from "../llm/index.js";
import { retrieve } from "../search/hybrid.js";
import { hydrateCards } from "../db/cards.js";
import type { Env } from "../bindings.js";
import type { SearchFilters, TitleCard } from "@latino-canon/core";
import type { ExtractedIntent, RankedTitle } from "./types.js";

/**
 * Extract structured intent from natural language query using Workers AI.
 * Parses out themes, decade, director preferences, tone, etc.
 */
export async function extractIntent(
  env: Env,
  query: string,
): Promise<ExtractedIntent | null> {
  const llm = makeLlmClient(env);

  const prompt = `Extract structured search intent from this user query. Return JSON.

User query: "${query}"

Extract (if mentioned):
- theme: One of [identity, family, labor, diaspora, coming_of_age, immigration, activism, faith, etc.]
- decade: Release decade (e.g., 1990, 2000)
- directorGender: "male", "female", "non-binary" if specified
- tone: "lighter"/"heavier"/"serious"/"comedic" if mentioned
- country: Country of origin if specified
- kind: "film", "series", "special"
- additionalContext: Any other relevant context

Return valid JSON only, no markdown. Example:
{"theme": "identity", "decade": 1990, "directorGender": "female", "tone": "lighter", "additionalContext": "contemporary politics"}`;

  try {
    const result = await llm.call({
      task: "classify",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
      json: true,
    });
    const parsed = JSON.parse(result.text);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Search across multiple modes and filters.
 */
export async function searchWithFilters(
  env: Env,
  query: string,
  filters: SearchFilters,
  mode: "hybrid" | "lexical" | "semantic" = "hybrid",
  limit: number = 20,
): Promise<TitleCard[]> {
  const hits = await retrieve(env, {
    query,
    mode,
    filters,
    limit,
  });

  return hydrateCards(env, hits);
}

/**
 * Score results by tone (heaviness) using Workers AI.
 * Returns map of titleId -> toneScore where score is 0-1 (0=opposite tone, 1=target tone).
 */
export async function scoreTone(
  env: Env,
  titles: TitleCard[],
  targetTone: "lighter" | "heavier" | "serious" | "comedic",
): Promise<Map<string, number>> {
  const llm = makeLlmClient(env);

  const titleDescriptions = titles
    .map(
      (t) =>
        `${t.id}: "${t.title}" (${t.yearStart}) - ${t.blurbTeaser || "(no description)"}`,
    )
    .join("\n");

  const prompt = `Score these films by ${targetTone} tone (0=opposite tone, 1=target tone).

Target tone: ${targetTone}

Films:
${titleDescriptions}

Return valid JSON only: {"title-id": 0.85, ...}`;

  try {
    const result = await llm.call({
      task: "judge",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 300,
      json: true,
    });
    const scores = JSON.parse(result.text);
    return new Map(Object.entries(scores) as [string, number][]);
  } catch {
    return new Map();
  }
}

/**
 * Fetch director gender from TMDB (using cached data if available).
 * For now, returns a placeholder; in production would call TMDB API.
 */
export async function getDirectorGender(
  env: Env,
  titleId: string,
): Promise<"male" | "female" | "non-binary" | "unknown"> {
  // In production: query D1 for cached director gender, fall back to TMDB
  // For now: return "unknown" and let the agent skip this filter if not available
  return "unknown";
}

/**
 * Re-rank results based on extracted intent and tone scores.
 */
export async function rerankedResults(
  titles: TitleCard[],
  intent: ExtractedIntent,
  toneScores?: Map<string, number>,
): Promise<RankedTitle[]> {
  return titles
    .map((title) => {
      const matchedCriteria: string[] = [];
      let score = 0;

      // Check theme match
      if (intent.theme && title.themes?.includes(intent.theme as never)) {
        matchedCriteria.push(`theme: ${intent.theme}`);
        score += 0.3;
      }

      // Check decade
      if (intent.decade && Math.floor(title.yearStart / 10) * 10 === intent.decade) {
        matchedCriteria.push(`decade: ${intent.decade}s`);
        score += 0.2;
      }

      // Check kind
      if (intent.kind && title.kind === intent.kind) {
        matchedCriteria.push(`type: ${intent.kind}`);
        score += 0.15;
      }

      // Check tone if available
      if (intent.tone && toneScores?.has(title.id)) {
        const toneScore = toneScores.get(title.id) || 0.5;
        matchedCriteria.push(`tone: ${intent.tone}`);
        score += toneScore * 0.25;
      }

      // Base score from search ranking
      score += (title.score || 0) * 0.1;

      return {
        title,
        score: Math.min(score, 1),
        matchedCriteria,
        reason: `Matched: ${matchedCriteria.join(", ")}. Relevance: ${(score * 100).toFixed(0)}%`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
