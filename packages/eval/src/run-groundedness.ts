/**
 * Blurb groundedness eval: for each stored blurb, ask an LLM judge whether every
 * claim is supported by the blurb's sources. Reports mean score + the worst offenders.
 *
 * Usage (enumerate all titles with blurbs):
 *   API_URL=http://localhost:8787 CF_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... pnpm eval:groundedness
 *
 * Or specify title IDs manually:
 *   API_URL=http://localhost:8787 CF_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... pnpm eval:groundedness <titleId> [titleId ...]
 *
 * Uses the API's /titles endpoint to pull blurb + sources (with ?hasBlurb=1 to enumerate).
 * The judge call goes to Workers AI's REST API directly (this script runs standalone via tsx,
 * outside a Worker, so there's no `env.AI` binding to use) - Workers AI only, by design,
 * no closed-model provider in this project.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  coerceLlmText,
  extractJson,
  GROUNDEDNESS_JUDGE_MODEL,
  GROUNDEDNESS_JUDGE_SYSTEM,
  GROUNDEDNESS_JUDGE_VERSION,
} from "@latino-canon/core";
import { writeEvalRunSql } from "./record-run.js";

const API_URL = process.env.API_URL ?? "http://localhost:8787";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

interface JudgeResult {
  titleId: string;
  score: number;
  unsupported: string[];
}

async function judge(blurb: string, sources: { id: string; text: string }[]): Promise<Omit<JudgeResult, "titleId">> {
  if (!CF_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error("set CF_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for the judge (Workers AI REST API)");
  }
  const user = `BLURB:\n${blurb}\n\nSOURCES:\n${sources.map((s) => `[${s.id}] ${s.text}`).join("\n")}`;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${GROUNDEDNESS_JUDGE_MODEL}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    },
    body: JSON.stringify({
      // Deterministic judge: without it, identical blurbs + sources scored 0.525 on one run
      // and 0.431 two days later - run-to-run noise, not a change in the blurbs.
      temperature: 0,
      // Without it the provider default clipped long "unsupported" lists mid-JSON (No Hands
      // on the Clock, 2nd v2 run), which then failed to parse and dropped out of the mean.
      max_tokens: 512,
      messages: [
        { role: "system", content: GROUNDEDNESS_JUDGE_SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`workers-ai judge ${r.status}: ${await r.text()}`);
  const d = (await r.json()) as { result?: { response?: unknown }; success: boolean; errors?: unknown[] };
  if (!d.success) throw new Error(`workers-ai judge failed: ${JSON.stringify(d.errors)}`);
  const parsed = extractJson(coerceLlmText(d.result?.response) || "{}") as { score?: unknown; unsupported?: unknown };
  return { score: Number(parsed.score) || 0, unsupported: Array.isArray(parsed.unsupported) ? parsed.unsupported : [] };
}

async function main() {
  let titleIds = process.argv.slice(2);

  // If no title IDs provided, enumerate from API
  if (titleIds.length === 0) {
    console.log("Enumerating titles with approved blurbs from API...");
    try {
      const r = await fetch(`${API_URL}/titles?hasBlurb=1&limit=10000`);
      if (!r.ok) throw new Error(`GET /titles failed: ${r.status}`);
      const data = (await r.json()) as { titleIds: string[]; count: number };
      titleIds = data.titleIds;
      console.log(`Found ${data.count} titles with approved blurbs`);
      if (titleIds.length === 0) {
        console.log("No titles with approved blurbs found. Nothing to evaluate.");
        process.exit(0);
      }
    } catch (e) {
      console.error(`Failed to enumerate titles from ${API_URL}:`);
      console.error(e instanceof Error ? e.message : String(e));
      console.log(`usage: pnpm eval:groundedness [<titleId> ...]`);
      console.log(`  or set API_URL to enumerate automatically from API`);
      process.exit(1);
    }
  }

  const results: JudgeResult[] = [];
  const failures: { titleId: string; error: string }[] = [];
  for (const id of titleIds) {
    const t = (await fetch(`${API_URL}/titles/${id}`).then((r) => r.json())) as {
      blurb?: { text: string; sources: { id: string; text: string }[] };
    };
    if (!t.blurb) continue;
    // GET /titles/:id resolves each source to the id the blurb cites and the text the
    // blurb model saw (core resolveBlurbSources). This used to send `quote ?? ref` - with
    // quote always null, that was a title slug and a director's name, never the synopsis,
    // so every run before GROUNDEDNESS_JUDGE_VERSION 2 scored blurbs against evidence the judge never had.
    const sources = t.blurb.sources.map((s) => ({ id: s.id, text: s.text }));
    try {
      const j = await judge(t.blurb.text, sources);
      results.push({ titleId: id, ...j });
    } catch (e) {
      // The judge model (a small 8B instruct model) occasionally ignores the
      // "return JSON only" instruction and free-writes its reasoning instead -
      // one bad completion shouldn't discard every score already computed in
      // this run, so skip and keep going rather than letting main() throw.
      failures.push({ titleId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const mean = results.reduce((s, r) => s + r.score, 0) / (results.length || 1);
  console.log(
    `groundedness mean: ${mean.toFixed(3)}  (n=${results.length}, failed=${failures.length}, judge v${GROUNDEDNESS_JUDGE_VERSION} ${GROUNDEDNESS_JUDGE_MODEL})`,
  );
  for (const f of failures) {
    console.log(`  FAILED  ${f.titleId}  ${f.error.slice(0, 120)}`);
  }
  for (const r of results.filter((r) => r.score < 0.9).sort((a, b) => a.score - b.score)) {
    console.log(`  ${r.titleId}  ${r.score.toFixed(2)}  unsupported: ${r.unsupported.join(" | ")}`);
  }

  mkdirSync(".eval-out", { recursive: true });
  writeFileSync(`.eval-out/groundedness-${Date.now()}.json`, JSON.stringify({ mean, results, failures }, null, 2));

  const worst = results.filter((r) => r.score < 0.9).sort((a, b) => a.score - b.score);
  writeEvalRunSql(".eval-out/insert.sql", {
    evalType: "groundedness",
    runAt: new Date().toISOString(),
    n: results.length,
    failed: failures.length,
    meanScore: results.length > 0 ? mean : null,
    metrics: { mean, judgeVersion: GROUNDEDNESS_JUDGE_VERSION },
    details: { worst, failures, judgeModel: GROUNDEDNESS_JUDGE_MODEL },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
