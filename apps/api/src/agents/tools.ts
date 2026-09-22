import type { LlmClient, SearchFilters, TitleCard } from "@latino-canon/core";
import { rewriteQuery } from "../ai/rewrite-query.js";
import { retrieve } from "../search/hybrid.js";
import { hydrateCards } from "../db/cards.js";
import type { Env } from "../bindings.js";
import type { ExtractedIntent } from "./types.js";

const DIRECTOR_GENDER_RE = /\b(directed|made|helmed)\b.{0,20}\b(women|female|woman)\b|\bwomen[- ]directed\b|\bfemale directors?\b/i;
const DIRECTOR_GENDER_MALE_RE = /\b(directed|made|helmed)\b.{0,20}\b(men|male|man)\b|\bmen[- ]directed\b|\bmale directors?\b/i;
const LIGHTER_RE = /\b(light(er)?|fun|funny|feel[- ]good|uplifting|comedic|comed(y|ies))\b/i;
const HEAVIER_RE = /\b(heavy|heavier|dark|serious|intense|not too light)\b/i;

/**
 * Everything rewriteQuery already extracts well (theme/decade/country/kind, with a
 * cheap rules pass and an LLM fallback that's zod-validated and AI-Gateway-cached for
 * repeated phrases) is reused as-is rather than reinvented. This only adds the two
 * signals rewriteQuery has no reason to know about: directorGender and tone, both
 * detectable from explicit keywords without spending an AI call on them at all - the
 * kind of judgment a 70B classify call brings nothing over a regex for.
 */
export async function extractIntent(llm: LlmClient, query: string): Promise<ExtractedIntent> {
  const interpretation = await rewriteQuery(llm, query);

  const directorGender = DIRECTOR_GENDER_RE.test(query)
    ? "female"
    : DIRECTOR_GENDER_MALE_RE.test(query)
      ? "male"
      : undefined;
  const tone = LIGHTER_RE.test(query) ? "lighter" : HEAVIER_RE.test(query) ? "heavier" : undefined;

  return {
    ...interpretation?.filters,
    directorGender,
    tone,
    cleanedQuery: interpretation?.cleanedQuery || query,
    source: interpretation?.source ?? "none",
  };
}

/** Hybrid search already fuses BM25 + semantic via RRF - no reason to also run a
 * separate lexical-only pass and merge them by hand, which just doubles the D1 work
 * for a strictly worse (unranked, hand-deduped) candidate set. */
export async function searchWithFilters(
  env: Env,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<TitleCard[]> {
  const hits = await retrieve(env, { query, mode: "hybrid", filters, limit });
  return hydrateCards(env, hits);
}

/**
 * Score candidates by tone (0=opposite, 1=target) using Workers AI. `titles` should
 * already be trimmed to a small top-K by the caller - scoring the full raw candidate
 * pool wastes budget on titles that were never going to rank anyway, and a prompt
 * covering dozens of titles risks running past maxTokens and silently truncating into
 * invalid JSON (the catch below then returns an empty map, so tone scoring for
 * everything after the cut point degrades silently, not loudly - staying small is
 * what keeps that from happening in practice, not the try/catch).
 */
export async function scoreTone(
  llm: LlmClient,
  titles: TitleCard[],
  targetTone: "lighter" | "heavier",
): Promise<Map<string, number>> {
  if (titles.length === 0) return new Map();

  const titleDescriptions = titles
    .map((t) => `${t.id}: "${t.title}" (${t.yearStart}) - ${t.blurbTeaser || "(no description)"}`)
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
      // Sized to the actual (small, caller-bounded) batch rather than a flat guess -
      // each entry is roughly 15-20 tokens of JSON; this leaves real headroom without
      // paying for a fixed 512-token ceiling on every call regardless of batch size.
      maxTokens: Math.min(1024, 80 + titles.length * 20),
      json: true,
      temperature: 0,
    });
    const scores = JSON.parse(result.text) as Record<string, number>;
    return new Map(Object.entries(scores));
  } catch (err) {
    console.warn("scoreTone failed, skipping tone scoring:", err);
    return new Map();
  }
}

/** Re-rank candidates against the extracted intent. `limit` is the caller's own
 * requested page size (clamped by the route), not a hardcoded 5. */
export function rerankedResults(titles: TitleCard[], intent: ExtractedIntent, limit: number, toneScores?: Map<string, number>) {
  return titles
    .map((title) => {
      const matchedCriteria: string[] = [];
      let score = 0;

      if (intent.theme && title.themes.includes(intent.theme)) {
        matchedCriteria.push(`theme: ${intent.theme}`);
        score += 0.3;
      }

      if (intent.decade && Math.floor(title.yearStart / 10) * 10 === intent.decade) {
        matchedCriteria.push(`decade: ${intent.decade}s`);
        score += 0.2;
      }

      if (intent.kind && title.kind === intent.kind) {
        matchedCriteria.push(`type: ${intent.kind}`);
        score += 0.15;
      }

      if (intent.directorGender && title.directorGender === intent.directorGender) {
        matchedCriteria.push(`director: ${intent.directorGender}`);
        score += 0.2;
      }

      if (intent.tone && toneScores?.has(title.id)) {
        const toneScore = toneScores.get(title.id) ?? 0.5;
        matchedCriteria.push(`tone: ${intent.tone}`);
        score += toneScore * 0.25;
      }

      // Base score from the search ranking itself, so a strong hybrid match still
      // counts even when it doesn't happen to match any extracted filter.
      score += (title.score || 0) * 0.1;

      return {
        title,
        score: Math.min(score, 1),
        matchedCriteria,
        reason: matchedCriteria.length
          ? `Matched: ${matchedCriteria.join(", ")}. Relevance: ${(score * 100).toFixed(0)}%`
          : `Relevance: ${(score * 100).toFixed(0)}%`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
