import {
  CLASSIFY_SYSTEM,
  classifyUser,
  classificationSchema,
  extractJson,
  type ClassificationResult,
  type LlmClient,
} from "@latino-canon/core";

export interface ClassifyInput {
  title: string;
  year: number;
  synopsis: string | null;
  directors: string[];
  creators: string[];
  writers: string[];
  topCast: string[];
  countries: string[];
}

/**
 * Zero-shot inclusion-type + theme classification. Offline batch call in apps/ingest.
 *
 * TODO:
 *  - add 3-5 few-shot exemplars (one per inclusion_type) to the messages
 *  - persist raw model output alongside parsed tags for eval / audit
 *  - route confidences < MODEL_TAG_DISPLAY_THRESHOLD to ingest_jobs(status='needs_review')
 */
export async function classifyTitle(
  llm: LlmClient,
  input: ClassifyInput,
): Promise<ClassificationResult> {
  const res = await llm.call({
    task: "classify",
    json: true,
    maxTokens: 400,
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: classifyUser(input) },
    ],
  });
  return classificationSchema.parse(extractJson(res.text));
}
