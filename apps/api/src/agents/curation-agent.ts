import type { Env } from "../bindings.js";
import { makeLlmClient } from "../llm/index.js";
import { extractIntent, searchWithFilters, scoreTone, rerankedResults } from "./tools.js";
import type { CurationRequest, CurationResponse } from "./types.js";

// Candidates are scored by tone with an LLM call whose prompt cost scales with how
// many titles it describes - capping the pool before that call, not after, is what
// keeps scoreTone's maxTokens estimate (tools.ts) actually sized correctly, and keeps
// a popular query from silently paying for a much bigger prompt than a rare one.
const TONE_SCORING_POOL = 12;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

/**
 * Curation Agent: orchestrates a multi-step search workflow with a visible reasoning
 * trail, spending an AI call only where a rule genuinely can't do the job:
 * 1. Extract intent - theme/decade/country/kind via rewriteQuery (rules-first, LLM
 *    fallback, already used by /search); directorGender/tone via local keyword rules.
 * 2. Run one hybrid search (BM25 + semantic, already RRF-fused).
 * 3. Score a small top-K pool by tone (AI - the one step an LLM genuinely earns).
 * 4. Re-rank and return the caller's requested number of results.
 */
export async function curate(env: Env, request: CurationRequest): Promise<CurationResponse> {
  const limit = Math.min(Math.max(request.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const reasoning: string[] = [];
  const llm = makeLlmClient(env);

  try {
    reasoning.push(`[1/4] Parsing intent from: "${request.query}"`);
    const intent = await extractIntent(llm, request.query);
    reasoning.push(
      intent.source === "none"
        ? "No structured filters found; searching on the raw query"
        : `Extracted (${intent.source}): theme=${intent.theme ?? "any"}, decade=${intent.decade ?? "any"}, ` +
          `directorGender=${intent.directorGender ?? "any"}, tone=${intent.tone ?? "any"}`,
    );

    reasoning.push("[2/4] Running hybrid search");
    const filters = { kind: intent.kind, decade: intent.decade, country: intent.country, theme: intent.theme };
    const results = await searchWithFilters(env, intent.cleanedQuery, filters, Math.max(limit * 4, 20));
    reasoning.push(`Hybrid search: ${results.length} candidates`);

    let toneScores: Map<string, number> | undefined;
    if (intent.tone && results.length > 0) {
      const pool = results.slice(0, TONE_SCORING_POOL);
      reasoning.push(`[3/4] Scoring top ${pool.length} candidates by "${intent.tone}" tone`);
      toneScores = await scoreTone(llm, pool, intent.tone);
      reasoning.push(`Scored ${toneScores.size} results for tone`);
    } else {
      reasoning.push("[3/4] Tone scoring skipped (not requested)");
    }

    reasoning.push("[4/4] Re-ranking results");
    const ranked = rerankedResults(results, intent, limit, toneScores);
    reasoning.push(`Final ranking: ${ranked.length} results`);

    return {
      userQuery: request.query,
      interpretation: `Theme: ${intent.theme ?? "any"}, Decade: ${intent.decade ?? "any"}, Director gender: ${intent.directorGender ?? "any"}, Tone: ${intent.tone ?? "any"}`,
      topResults: ranked,
      totalMatches: results.length,
      reasoning,
      extractedIntent: intent,
      cached: false,
    };
  } catch (err) {
    reasoning.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      userQuery: request.query,
      interpretation: "Error during processing",
      topResults: [],
      totalMatches: 0,
      reasoning,
      extractedIntent: { cleanedQuery: request.query, source: "none" },
      cached: false,
    };
  }
}
