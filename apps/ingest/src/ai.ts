import {
  EMBEDDING_MODEL,
  CLASSIFY_SYSTEM,
  classifyUser,
  classificationSchema,
  BLURB_SYSTEM,
  blurbUser,
  blurbSchema,
  CONTENT_ADVISORY_SYSTEM,
  contentAdvisoryUser,
  contentAdvisoryClassificationSchema,
  coerceLlmText,
  extractJson,
  normalizeClassificationJson,
  normalizeBlurbJson,
  normalizeContentAdvisoryJson,
  MODELS,
  GROUNDEDNESS_JUDGE_MODEL,
  GROUNDEDNESS_JUDGE_SYSTEM,
  groundednessJudgeUser,
  parseGroundednessVerdict,
  type GroundednessVerdict,
  type BlurbResult,
  type ResolvedBlurbSource,
  type ClassificationResult,
  type ContentAdvisory,
  type Title,
} from "@latino-canon/core";
import { ZodError } from "zod";
import type { Env } from "./bindings.js";

/**
 * Cloudflare Workflows loses ZodError's real message (a computed getter) when a step
 * exhausts its retries and the error crosses the durable-storage boundary - both the
 * instance history and our own ingest_jobs.error end up with just the bare class name
 * ("Error: ZodError"), no detail. Force the detailed message into a plain Error's
 * message *before* it can cross that boundary.
 */
function parseLlm<T>(schema: { parse: (v: unknown) => T }, value: unknown, context: string): T {
  try {
    return schema.parse(value);
  } catch (err) {
    if (err instanceof ZodError) throw new Error(`${context}: ${err.message}`);
    throw err;
  }
}

/**
 * The ingest worker calls Workers AI directly (it doesn't import the api's LlmClient
 * to avoid a cross-worker dependency). Same models, same prompts from core. Workers AI
 * only, by design - no closed-model provider in this project.
 */

export async function embedText(env: Env, text: string): Promise<number[]> {
  const [v] = await embedTexts(env, [text]);
  return v!;
}

/** One Workers AI call for the whole batch - rebuildVectors pages through the catalog with this. */
export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  const res = (await env.AI.run(EMBEDDING_MODEL as Parameters<Ai["run"]>[0], {
    text: texts,
  } as Parameters<Ai["run"]>[1])) as { data: number[][] };
  if (res.data.length !== texts.length || res.data.some((v) => !v?.length)) {
    throw new Error(`embedTexts: expected ${texts.length} embeddings, got ${res.data.length}`);
  }
  return res.data;
}

export async function classifyForIngest(env: Env, t: Title): Promise<ClassificationResult> {
  const user = classifyUser({
    title: t.title,
    year: t.yearStart,
    synopsis: t.synopsis,
    directors: creditNames(t, "director"),
    creators: creditNames(t, "creator"),
    writers: creditNames(t, "writer"),
    topCast: creditNames(t, "cast").slice(0, 8),
    countries: t.country,
  });
  const out = await runLlm(env, "classify", CLASSIFY_SYSTEM, user);
  return parseLlm(classificationSchema, normalizeClassificationJson(extractJson(out)), "classify");
}

/**
 * Separate, cheaper call from classifyForIngest - a general/mature judgment doesn't
 * need the 70B classify model's multi-label nuance, and keeping it a distinct call
 * (rather than folding it into CLASSIFY_SYSTEM's output) means it can be backfilled
 * against already-classified titles without re-running or disturbing their existing
 * inclusion_type/theme tags.
 */
export async function classifyContentAdvisory(
  env: Env,
  input: { title: string; year: number; synopsis: string | null },
): Promise<ContentAdvisory> {
  const user = contentAdvisoryUser(input);
  const out = await runLlm(env, "content-advisory", CONTENT_ADVISORY_SYSTEM, user);
  const parsed = parseLlm(
    contentAdvisoryClassificationSchema,
    normalizeContentAdvisoryJson(extractJson(out)),
    "content-advisory",
  );
  return parsed.rating;
}

export interface BlurbGroundingResult {
  result: BlurbResult;
  sources: ResolvedBlurbSource[];
  model: string;
}

/**
 * The sources a blurb may cite. Credit text names the work ("Tlayucan (1962) is directed
 * by Luis Alcoriza.") because the model otherwise never sees the title - it called the
 * Linha de Passe blurb's film by a character's name - and a title the blurb states then
 * has a source behind it. The award source is OMDb's awards line, fetched at ingest for
 * years and discarded until now: the one sourced way to say why a title is recognized.
 */
export function blurbSources(t: Title, awards: string | null): ResolvedBlurbSource[] {
  const work = `${t.title} (${t.yearStart})`;
  return [
    t.synopsis ? { id: "s1", kind: "synopsis" as const, ref: t.id, quote: null, text: t.synopsis } : null,
    ...creditNames(t, "director").map((n, i) => ({
      id: `d${i}`,
      kind: "credit" as const,
      ref: n,
      quote: null,
      text: `${work} is directed by ${n}.`,
    })),
    awards ? { id: "a1", kind: "award" as const, ref: t.imdbId ?? t.id, quote: null, text: `${work} awards (OMDb): ${awards}` } : null,
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));
}

export async function blurbForIngest(
  env: Env,
  t: Title,
  classification: ClassificationResult,
  awards: string | null,
): Promise<BlurbGroundingResult> {
  const sources = blurbSources(t, awards);

  const out = await runLlm(
    env,
    "blurb",
    BLURB_SYSTEM,
    blurbUser(sources.map((s) => ({ id: s.id, kind: s.kind, text: s.text }))),
  );
  const result = parseLlm(blurbSchema, normalizeBlurbJson(extractJson(out)), "blurb");
  void classification;
  return {
    result,
    // id + text are what the blurb cites and what the model saw - both needed for the
    // groundedness judge and for rendering citations (see core resolveBlurbSources).
    sources: sources.map(({ id, kind, ref, quote, text }) => ({ kind, ref, quote, id, text })),
    model: MODELS.blurb,
  };
}

/**
 * The v3 groundedness judge on one fresh blurb - the same model, system prompt and input
 * format as the eval harness (core groundedness.ts), so an ingest verdict means what an
 * eval score means. ~13 neurons a blurb.
 */
export async function judgeBlurb(env: Env, blurb: BlurbGroundingResult): Promise<GroundednessVerdict> {
  const res = (await env.AI.run(
    GROUNDEDNESS_JUDGE_MODEL as Parameters<Ai["run"]>[0],
    {
      messages: [
        { role: "system", content: GROUNDEDNESS_JUDGE_SYSTEM },
        { role: "user", content: groundednessJudgeUser(blurb.result.text, blurb.sources) },
      ],
      max_tokens: 512,
      temperature: 0,
    } as Parameters<Ai["run"]>[1],
    { gateway: { id: env.AI_GATEWAY_ID, metadata: { task: "judge", pipeline: "ingest" } } },
  )) as { response?: unknown };
  return parseGroundednessVerdict(res.response);
}

// --- provider plumbing ------------------------------------------------------

async function runLlm(
  env: Env,
  task: "classify" | "blurb" | "content-advisory",
  system: string,
  user: string,
): Promise<string> {
  const res = (await env.AI.run(
    MODELS[task],
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 400,
      temperature: task === "blurb" ? 0.3 : 0,
    } as Parameters<Ai["run"]>[1],
    { gateway: { id: env.AI_GATEWAY_ID, metadata: { task, pipeline: "ingest" } } },
  )) as { response?: unknown };
  return coerceLlmText(res.response);
}

function creditNames(t: Title, role: "director" | "writer" | "creator" | "cast"): string[] {
  return t.credits.filter((c) => c.role === role).sort((a, b) => a.order - b.order).map((c) => c.person.name);
}
