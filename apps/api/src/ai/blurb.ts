import {
  BLURB_SYSTEM,
  blurbUser,
  blurbSchema,
  extractJson,
  type BlurbResult,
  type BlurbSource,
  type LlmClient,
} from "@latino-canon/core";

export interface BlurbGroundingSource {
  id: string;
  kind: BlurbSource["kind"];
  text: string;
}

/**
 * RAG "why it matters" blurb. Grounding is assembled by the caller (apps/ingest) from:
 *   - the synopsis
 *   - LOC Latinx filmography / UCLA guide notes, if the title is on those lists
 *   - key credits (director, creator)
 *   - award / milestone facts
 *
 * The model must cite a source id for every claim; unsupported claims are how the eval
 * harness (packages/eval groundedness) flags a bad blurb.
 *
 * TODO:
 *  - reject (don't store) blurbs whose claims cite ids not in `sources`
 *  - store BlurbResult.claims for the eval harness
 */
export async function generateBlurb(
  llm: LlmClient,
  sources: BlurbGroundingSource[],
): Promise<{ result: BlurbResult; model: string }> {
  const res = await llm.call({
    task: "blurb",
    json: true,
    maxTokens: 300,
    temperature: 0.3,
    messages: [
      { role: "system", content: BLURB_SYSTEM },
      { role: "user", content: blurbUser(sources) },
    ],
  });
  return { result: blurbSchema.parse(extractJson(res.text)), model: res.model };
}
