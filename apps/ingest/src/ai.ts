import {
  EMBEDDING_MODEL,
  CLASSIFY_SYSTEM,
  classifyUser,
  classificationSchema,
  BLURB_SYSTEM,
  blurbUser,
  blurbSchema,
  coerceLlmText,
  extractJson,
  normalizeClassificationJson,
  normalizeBlurbJson,
  MODELS,
  type BlurbResult,
  type BlurbSource,
  type ClassificationResult,
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
 * to avoid a cross-worker dependency). Same models, same prompts from core.
 * Set LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY to route blurb generation to Claude.
 */

export async function embedText(env: Env, text: string): Promise<number[]> {
  const res = (await env.AI.run(EMBEDDING_MODEL as Parameters<Ai["run"]>[0], {
    text: [text],
  } as Parameters<Ai["run"]>[1])) as { data: number[][] };
  const v = res.data[0];
  if (!v) throw new Error("embedText: empty embedding");
  return v;
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

export interface BlurbGroundingResult {
  result: BlurbResult;
  sources: BlurbSource[];
  model: string;
}

export async function blurbForIngest(
  env: Env,
  t: Title,
  classification: ClassificationResult,
): Promise<BlurbGroundingResult> {
  // TODO: enrich with LOC Latinx filmography / UCLA guide notes + award facts (OMDb).
  const sources = [
    t.synopsis ? { id: "s1", kind: "synopsis" as const, ref: t.id, quote: null, text: t.synopsis } : null,
    ...creditNames(t, "director").map((n, i) => ({
      id: `d${i}`,
      kind: "credit" as const,
      ref: n,
      quote: null,
      text: `Directed by ${n}.`,
    })),
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

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
    sources: sources.map(({ id, kind, ref, quote }) => ({ kind, ref, quote })),
    model: modelFor(env, "blurb"),
  };
}

// --- provider plumbing ------------------------------------------------------

function modelFor(env: Env, task: "classify" | "blurb"): string {
  return MODELS[env.LLM_PROVIDER][task];
}

async function runLlm(env: Env, task: "classify" | "blurb", system: string, user: string): Promise<string> {
  if (env.LLM_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY unset");
    const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/anthropic/v1/messages`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "cf-aig-metadata": JSON.stringify({ task, pipeline: "ingest" }),
      },
      body: JSON.stringify({
        model: modelFor(env, task),
        system,
        messages: [{ role: "user", content: user }],
        max_tokens: 400,
        temperature: task === "blurb" ? 0.3 : 0,
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
    const d = (await r.json()) as { content: { type: string; text: string }[] };
    return d.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  }

  const res = (await env.AI.run(
    modelFor(env, task) as Parameters<Ai["run"]>[0],
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
