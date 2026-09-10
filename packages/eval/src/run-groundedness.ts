/**
 * Blurb groundedness eval: for each stored blurb, ask an LLM judge whether every
 * claim is supported by the blurb's sources. Reports mean score + the worst offenders.
 *
 *   API_URL=... ANTHROPIC_API_KEY=... pnpm eval:groundedness
 *
 * Uses the api's /titles endpoint to pull blurb + sources. The judge call goes direct
 * to Anthropic (or set JUDGE=workers-ai to hit the api's own gateway route — TODO).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { GROUNDEDNESS_JUDGE_SYSTEM } from "@latino-canon/core";

const API_URL = process.env.API_URL ?? "http://localhost:8787";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

interface JudgeResult {
  titleId: string;
  score: number;
  unsupported: string[];
}

async function judge(blurb: string, sources: { id: string; text: string }[]): Promise<Omit<JudgeResult, "titleId">> {
  if (!ANTHROPIC_API_KEY) throw new Error("set ANTHROPIC_API_KEY for the judge");
  const user = `BLURB:\n${blurb}\n\nSOURCES:\n${sources.map((s) => `[${s.id}] ${s.text}`).join("\n")}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system: GROUNDEDNESS_JUDGE_SYSTEM,
      messages: [{ role: "user", content: user }],
      max_tokens: 300,
    }),
  });
  const d = (await r.json()) as { content: { type: string; text: string }[] };
  const text = d.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return { score: Number(parsed.score) || 0, unsupported: parsed.unsupported ?? [] };
}

async function main() {
  // TODO: add GET /titles?hasBlurb=1 to the api to enumerate; for now read ids from argv.
  const titleIds = process.argv.slice(2);
  if (titleIds.length === 0) {
    console.log("usage: pnpm eval:groundedness <titleId> [titleId ...]");
    process.exit(1);
  }

  const results: JudgeResult[] = [];
  for (const id of titleIds) {
    const t = (await fetch(`${API_URL}/titles/${id}`).then((r) => r.json())) as {
      blurb?: { text: string; sources: { id?: string; ref: string; quote: string | null }[] };
    };
    if (!t.blurb) continue;
    const sources = t.blurb.sources.map((s, i) => ({ id: s.id ?? `s${i}`, text: s.quote ?? s.ref }));
    const j = await judge(t.blurb.text, sources);
    results.push({ titleId: id, ...j });
  }

  const mean = results.reduce((s, r) => s + r.score, 0) / (results.length || 1);
  console.log(`groundedness mean: ${mean.toFixed(3)}  (n=${results.length})`);
  for (const r of results.filter((r) => r.score < 0.9).sort((a, b) => a.score - b.score)) {
    console.log(`  ${r.titleId}  ${r.score.toFixed(2)}  unsupported: ${r.unsupported.join(" | ")}`);
  }

  mkdirSync(".eval-out", { recursive: true });
  writeFileSync(`.eval-out/groundedness-${Date.now()}.json`, JSON.stringify({ mean, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
