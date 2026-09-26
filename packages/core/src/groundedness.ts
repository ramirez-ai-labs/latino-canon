import { coerceLlmText, extractJson } from "./llm.js";

/**
 * The groundedness judge's input and output, shared by the eval harness
 * (packages/eval run-groundedness.ts) and the ingest-time gate (apps/ingest), so an
 * ingest verdict and an eval score are the same measurement. Changing the user-prompt
 * format changes what the judge sees - that's a GROUNDEDNESS_JUDGE_VERSION bump.
 */

export interface GroundednessVerdict {
  /** Share of the blurb's claims its sources support, 0-1. */
  score: number;
  /** The unsupported claims, quoted from the blurb. */
  unsupported: string[];
}

export function groundednessJudgeUser(blurb: string, sources: { id: string; text: string }[]): string {
  return `BLURB:\n${blurb}\n\nSOURCES:\n${sources.map((s) => `[${s.id}] ${s.text}`).join("\n")}`;
}

/**
 * Throws when the reply holds no JSON object (the judge sometimes free-writes its
 * reasoning instead); a missing or non-numeric score parses as 0, a fail.
 */
export function parseGroundednessVerdict(response: unknown): GroundednessVerdict {
  const parsed = extractJson(coerceLlmText(response) || "{}") as { score?: unknown; unsupported?: unknown };
  const score = Number(parsed.score);
  return {
    score: Number.isFinite(score) ? Math.min(Math.max(score, 0), 1) : 0,
    unsupported: Array.isArray(parsed.unsupported) ? parsed.unsupported.map(String) : [],
  };
}

/**
 * Ingest auto-approves a blurb only when the v3 judge finds every claim supported. The
 * judge scores in coarse steps - on the 2026-09-24 run, 132 of 136 failing blurbs scored
 * exactly 0.5 (one of two sentences unsupported) - so anything below 1.0 means a whole
 * sentence no source backs. Those stay unapproved for an editor.
 */
export const BLURB_AUTO_APPROVE_MIN_SCORE = 1;

export function passesBlurbGate(v: GroundednessVerdict): boolean {
  return v.score >= BLURB_AUTO_APPROVE_MIN_SCORE && v.unsupported.length === 0;
}
