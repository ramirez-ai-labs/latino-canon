/**
 * MCP tool-selection eval (scoring in mcp-tools.ts). For each golden case, a Workers AI
 * model gets exactly what an MCP client gets from the live server - its `instructions`
 * and `tools/list` - plus the request, and must call the right tool with the right
 * arguments, or no tool when none fits.
 *
 *   CF_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... pnpm --filter @latino-canon/eval mcp-tools
 *
 * MCP_URL points at another server (a preview deploy, say). CASES=id1,id2 runs a subset.
 * Manual only (eval-mcp-tools.yml): 41 cases with the tool list in every prompt. The first
 * 30-case run cost 1,408 neurons on the 70B (~47 a case), so a full run is ~1.9k - under the
 * ~2k cap for the day's one optional 70B job. TOOL_MODEL picks another model (see prices).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeEvalRunSql } from "./record-run.js";
import {
  parseToolCall,
  scoreCase,
  summarize,
  toWorkersAiTools,
  type CaseResult,
  type ChatMessage,
  type McpTool,
  type ToolCase,
} from "./mcp-tools.js";

const MCP_URL = process.env.MCP_URL ?? "https://latino-canon-mcp.ai-builders-studio-latinx.workers.dev/mcp";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
/**
 * Llama 3.3 70B: the strongest function-calling model on Workers AI and the one the project
 * already runs. Real clients bring stronger models (Claude, GPT); if a 70B open model picks
 * the right tool from these descriptions, the descriptions are doing their job.
 */
const MODEL = process.env.TOOL_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
/**
 * Workers AI prices in neurons per million tokens [input, output], for the cost line
 * (developers.cloudflare.com/workers-ai/platform/pricing, 2026-09-30). Only models the model
 * catalog marks "Function calling" are here; the 8B Llama isn't marked, so a low score from it
 * would partly measure the API rather than the tool descriptions. A second model shows
 * whether the descriptions work beyond the one they were written against.
 */
const TOOL_MODEL_PRICES: Record<string, [number, number]> = {
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26_668, 204_805],
  "@cf/meta/llama-4-scout-17b-16e-instruct": [24_545, 77_273],
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31_876, 50_488],
};
const PRICE = TOOL_MODEL_PRICES[MODEL];
const PROTOCOL_VERSION = "2025-06-18";

/** What a client tells its model around the server's own instructions. */
const CLIENT_PREAMBLE =
  "You are an assistant with the Latino Canon MCP server connected. Call one of its tools when the " +
  "request is about films or series it could cover; otherwise answer directly without a tool.";

function loadCases(): { cases: ToolCase[]; hash: string } {
  const raw = readFileSync(fileURLToPath(new URL("./datasets/mcp-tools.jsonl", import.meta.url)), "utf8");
  const all = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ToolCase);
  const only = process.env.CASES?.trim() ? process.env.CASES.split(",").map((s) => s.trim()) : undefined;
  return {
    cases: only ? all.filter((c) => only.includes(c.id)) : all,
    hash: createHash("sha256").update(raw).digest("hex").slice(0, 12),
  };
}

let rpcId = 0;
/** One JSON-RPC call to the stateless server; it answers with plain JSON (enableJsonResponse). */
async function mcp<T>(method: string, params: unknown = {}): Promise<T> {
  const r = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`MCP ${method} ${r.status}: ${text.slice(0, 200)}`);
  // An SSE-framed reply carries the JSON on its data: line.
  const body = text.startsWith("{") ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? "");
  const d = JSON.parse(body) as { result?: T; error?: { message: string } };
  if (d.error || !d.result) throw new Error(`MCP ${method}: ${d.error?.message ?? "no result"}`);
  return d.result;
}

interface AiResult {
  response?: unknown;
  tool_calls?: { name?: string; arguments?: unknown }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function runModel(messages: { role: string; content: string }[], tools: ReturnType<typeof toWorkersAiTools>): Promise<AiResult> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
    // Temperature 0 so a rerun on unchanged descriptions scores the same (the groundedness
    // judge scored identical inputs 0.525 and 0.431 before it was pinned).
    body: JSON.stringify({ messages, tools, temperature: 0, max_tokens: 256 }),
  });
  if (!r.ok) throw new Error(`workers-ai ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()) as { result?: AiResult; success: boolean; errors?: unknown[] };
  if (!d.success || !d.result) throw new Error(`workers-ai failed: ${JSON.stringify(d.errors)}`);
  return d.result;
}

/** Report lines go to stdout: this is a CLI, and its output is the report. */
const log = (line: string) => process.stdout.write(`${line}\n`);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

async function main() {
  // Refuse before spending: a model with no known price can't report what the run cost.
  if (!PRICE) throw new Error(`no price for ${MODEL}; use one of: ${Object.keys(TOOL_MODEL_PRICES).join(", ")}`);
  if (!CF_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error("set CF_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers AI REST API)");
  }
  const { cases, hash } = loadCases();
  const init = await mcp<{ instructions?: string; serverInfo?: { version?: string } }>("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "latino-canon-tool-eval", version: "1" },
  });
  const { tools } = await mcp<{ tools: McpTool[] }>("tools/list");
  const aiTools = toWorkersAiTools(tools);
  const toolNames = tools.map((t) => t.name);
  const system = `${CLIENT_PREAMBLE}\n\n${init.instructions ?? ""}`.trim();
  log(`MCP server ${init.serverInfo?.version ?? "?"} at ${MCP_URL}: ${toolNames.join(", ")}`);
  log(`${cases.length} cases (set ${hash}), model ${MODEL}\n`);

  const results: CaseResult[] = [];
  const failures: { id: string; error: string }[] = [];
  let inTokens = 0;
  let outTokens = 0;
  for (const c of cases) {
    const messages: ChatMessage[] = [...(c.context ?? []), { role: "user", content: c.request }];
    try {
      const out = await runModel([{ role: "system", content: system }, ...messages], aiTools);
      inTokens += out.usage?.prompt_tokens ?? 0;
      outTokens += out.usage?.completion_tokens ?? 0;
      const r = scoreCase(c, parseToolCall(out, toolNames), tools);
      results.push(r);
      const call = r.called ? `${r.called.name}(${JSON.stringify(r.called.arguments)})` : "no tool";
      log(`${r.pass ? "✓" : "✗"} ${c.id.padEnd(28)} ${call}${r.problems.length ? `  - ${r.problems.join("; ")}` : ""}`);
    } catch (e) {
      // One failed call shouldn't discard the rest of the run; it's reported, not scored.
      failures.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
      log(`! ${c.id.padEnd(28)} ${failures.at(-1)!.error.slice(0, 120)}`);
    }
  }

  const s = summarize(results);
  const neurons = Math.round((inTokens * PRICE[0] + outTokens * PRICE[1]) / 1e6);
  log(
    `\npass ${pct(s.passRate)}  tool ${pct(s.toolAccuracy)}  args ${pct(s.argAccuracy)}${s.hard ? `  hard ${pct(s.hard.passRate)} of ${s.hard.n}` : ""}  (n=${s.n}, failed=${failures.length})`,
  );
  for (const [cat, v] of Object.entries(s.byCategory)) log(`  ${cat.padEnd(10)} ${pct(v.passRate)} of ${v.n}`);
  log(`tokens in ${inTokens}, out ${outTokens}: ~${neurons} neurons`);

  mkdirSync(".eval-out", { recursive: true });
  writeFileSync(`.eval-out/mcp-tools-${Date.now()}.json`, JSON.stringify({ MCP_URL, model: MODEL, hash, summary: s, results, failures }, null, 2));
  // Nothing scored (bad token, Workers AI down, the day's neurons spent) is an outage, not
  // a 0% score: fail the job and write no row, so the Eval page never shows it as a result.
  if (results.length === 0) throw new Error(`no case was scored; ${failures.length} model calls failed`);
  writeEvalRunSql(".eval-out/insert.sql", {
    evalType: "mcp-tools",
    runAt: new Date().toISOString(),
    n: s.n,
    failed: failures.length,
    meanScore: s.n > 0 ? s.passRate : null,
    metrics: {
      passRate: s.passRate,
      toolAccuracy: s.toolAccuracy,
      argAccuracy: s.argAccuracy,
      ...(s.hard ? { hardPassRate: s.hard.passRate } : {}),
      ...Object.fromEntries(Object.entries(s.byCategory).map(([cat, v]) => [`category.${cat}`, v.passRate])),
      neurons,
    },
    details: {
      model: MODEL,
      caseSetHash: hash,
      serverVersion: init.serverInfo?.version ?? null,
      byCategory: s.byCategory,
      hard: s.hard ?? null,
      misses: results
        .filter((r) => !r.pass)
        .map((r) => ({ id: r.id, category: r.category, hard: r.hard, expected: r.expected, called: r.called, problems: r.problems })),
      failures,
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
