import type { Env } from "../bindings.js";
import {
  extractIntent,
  searchWithFilters,
  scoreTone,
  rerankedResults,
} from "./tools.js";
import type { CurationRequest, CurationResponse, ExtractedIntent } from "./types.js";

/**
 * Curation Agent: Orchestrates multi-step search workflow.
 * 1. Parse intent from natural language query
 * 2. Search with multiple modes and filters
 * 3. Score results by tone (if specified)
 * 4. Re-rank and return top 5 with reasoning
 */
export async function curate(
  env: Env,
  request: CurationRequest,
): Promise<CurationResponse> {
  const reasoning: string[] = [];
  let extractedIntent: ExtractedIntent | null = null;
  let error: string | null = null;

  try {
    // Step 1: Parse intent from natural language
    reasoning.push(`[1/4] Parsing intent from: "${request.query}"`);
    extractedIntent = await extractIntent(env, request.query);

    if (extractedIntent) {
      reasoning.push(
        `Extracted: theme=${extractedIntent.theme || "any"}, decade=${extractedIntent.decade || "any"}, directorGender=${extractedIntent.directorGender || "any"}, tone=${extractedIntent.tone || "any"}`,
      );
    } else {
      reasoning.push("Could not parse structured intent; proceeding with keyword search");
      extractedIntent = { additionalContext: request.query };
    }

    // Step 2: Multi-mode search
    reasoning.push(`[2/4] Running multi-mode search`);
    const query = extractedIntent?.additionalContext || request.query;
    const filters: Record<string, any> = {};
    if (extractedIntent?.theme) filters.theme = extractedIntent.theme;
    if (extractedIntent?.decade) filters.decade = extractedIntent.decade;
    if (extractedIntent?.kind) filters.kind = extractedIntent.kind;

    const [hybridResults, lexicalResults] = await Promise.all([
      searchWithFilters(env, query, filters, "hybrid", 20),
      searchWithFilters(env, query, filters, "lexical", 20),
    ]);

    reasoning.push(`Hybrid search: ${hybridResults.length} results`);
    reasoning.push(`Lexical search: ${lexicalResults.length} results`);

    // Step 3: Score by tone (if specified)
    let toneScores: Map<string, number> | undefined;
    if (extractedIntent?.tone) {
      reasoning.push(`[3/4] Scoring results by "${extractedIntent.tone}" tone`);
      const allResults = [...hybridResults, ...lexicalResults];
      const uniqueResults = Array.from(
        new Map(allResults.map((r) => [r.id, r])).values(),
      );
      toneScores = await scoreTone(env, uniqueResults, extractedIntent.tone as any);
      reasoning.push(`Scored ${toneScores.size} results for tone`);
    } else {
      reasoning.push("[3/4] Tone scoring skipped (not specified)");
    }

    // Step 4: Re-rank and finalize
    reasoning.push(`[4/4] Re-ranking results`);
    const allResults = [...hybridResults, ...lexicalResults];
    const uniqueResults = Array.from(
      new Map(allResults.map((r) => [r.id, r])).values(),
    );

    const ranked = await rerankedResults(uniqueResults, extractedIntent || {}, toneScores);
    reasoning.push(`Final ranking: ${ranked.length} results by relevance`);

    return {
      userQuery: request.query,
      interpretation: extractedIntent
        ? `Theme: ${extractedIntent.theme || "any"}, Decade: ${extractedIntent.decade || "any"}, Director gender: ${extractedIntent.directorGender || "any"}, Tone: ${extractedIntent.tone || "any"}`
        : "Full catalog search",
      topResults: ranked,
      totalMatches: allResults.length,
      reasoning,
      extractedIntent: extractedIntent || {},
    };
  } catch (err) {
    reasoning.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      userQuery: request.query,
      interpretation: "Error during processing",
      topResults: [],
      totalMatches: 0,
      reasoning,
      extractedIntent: extractedIntent || {},
    };
  }
}
