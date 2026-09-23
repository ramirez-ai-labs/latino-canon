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
 * One structured JSON line per request, via console.warn (this project's eslint config
 * only allows warn/error, not log - see eslint.config.js). Cloudflare Workers Logs
 * parses console output as structured fields when it's valid JSON, so this (not the
 * human-readable `reasoning` array, which only ever reaches whoever called the
 * endpoint) is what actually makes a request queryable/graphable later: filter by
 * `event=agents.curate`, `source=llm`, `timings.totalMs>2000`, etc. in the Workers
 * Logs dashboard, or chart it on a Custom Dashboard.
 */
function logCurateEvent(fields: Record<string, unknown>): void {
  console.warn(JSON.stringify({ event: "agents.curate", ...fields }));
}

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
  const startedAt = Date.now();
  const timings: Record<string, number> = {};

  try {
    reasoning.push(`[1/4] Parsing intent from: "${request.query}"`);
    let stepStart = Date.now();
    const intent = await extractIntent(llm, request.query);
    timings.intentMs = Date.now() - stepStart;
    reasoning.push(
      intent.source === "none"
        ? "No structured filters found; searching on the raw query"
        : `Extracted (${intent.source}): theme=${intent.theme ?? "any"}, decade=${intent.decade ?? "any"}, ` +
          `directorGender=${intent.directorGender ?? "any"}, leadGender=${intent.leadGender ?? "any"}, tone=${intent.tone ?? "any"}`,
    );

    reasoning.push("[2/4] Running hybrid search");
    stepStart = Date.now();
    const filters = {
      kind: intent.kind,
      decade: intent.decade,
      country: intent.country,
      theme: intent.theme,
      genre: intent.genre,
      contentAdvisory: intent.contentAdvisory,
    };
    const results = await searchWithFilters(env, intent.cleanedQuery, filters, Math.max(limit * 4, 20));
    timings.searchMs = Date.now() - stepStart;
    reasoning.push(`Hybrid search: ${results.length} candidates`);

    let toneScores: Map<string, number> | undefined;
    if (intent.tone && results.length > 0) {
      const pool = results.slice(0, TONE_SCORING_POOL);
      reasoning.push(`[3/4] Scoring top ${pool.length} candidates by "${intent.tone}" tone`);
      stepStart = Date.now();
      toneScores = await scoreTone(llm, pool, intent.tone);
      timings.toneMs = Date.now() - stepStart;
      reasoning.push(`Scored ${toneScores.size} results for tone`);
    } else {
      reasoning.push("[3/4] Tone scoring skipped (not requested)");
    }

    reasoning.push("[4/4] Re-ranking results");
    stepStart = Date.now();
    const ranked = rerankedResults(results, intent, limit, toneScores);
    timings.rerankMs = Date.now() - stepStart;
    reasoning.push(`Final ranking: ${ranked.length} results`);
    timings.totalMs = Date.now() - startedAt;

    logCurateEvent({
      outcome: "completed",
      query: request.query,
      source: intent.source,
      theme: intent.theme,
      decade: intent.decade,
      directorGender: intent.directorGender,
      leadGender: intent.leadGender,
      tone: intent.tone,
      resultCount: ranked.length,
      totalMatches: results.length,
      timings,
    });

    return {
      userQuery: request.query,
      interpretation: `Theme: ${intent.theme ?? "any"}, Decade: ${intent.decade ?? "any"}, Director gender: ${intent.directorGender ?? "any"}, Lead gender: ${intent.leadGender ?? "any"}, Tone: ${intent.tone ?? "any"}`,
      topResults: ranked,
      totalMatches: results.length,
      reasoning,
      extractedIntent: intent,
      cached: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reasoning.push(`Error: ${message}`);
    timings.totalMs = Date.now() - startedAt;
    logCurateEvent({ outcome: "error", query: request.query, error: message, timings });

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
