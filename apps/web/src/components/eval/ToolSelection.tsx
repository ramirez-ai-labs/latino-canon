import type { EvalRun } from "@latino-canon/core";

/**
 * The MCP tool-selection eval (packages/eval/src/run-mcp-tools.ts): a model gets only what
 * the live MCP server tells every assistant - its instructions and tool list - and must call
 * the right tool with the right arguments. Server-rendered from the latest recorded run.
 */

interface Miss {
  id: string;
  category: string;
  expected: string | null;
  called: { name: string; arguments: Record<string, unknown> } | null;
  problems: string[];
}

interface ToolRunDetails {
  model?: string;
  serverVersion?: string | null;
  byCategory?: Record<string, { n: number; passRate: number }>;
  misses?: Miss[];
}

/** What each group of test requests asks the assistant to do, in a reader's words. */
export const CATEGORY_NAME: Record<string, string> = {
  search: "Look something up",
  filters: "Search with a filter",
  get_title: "Open a result",
  similar: "More like this",
  curate: "Recommend",
  none: "Off-topic: no tool",
};
const CATEGORY_EXAMPLE: Record<string, string> = {
  search: "“What has Gael García Bernal been in?”",
  filters: "“Horror movies from Argentina”",
  get_title: "“Tell me more about the second one”",
  similar: "“More like Coco, please”",
  curate: "“Something uplifting by a Latina director”",
  none: "“What's the capital of Peru?”",
};

const pct = (x: number | undefined) => (x === undefined ? "—" : `${Math.round(x * 100)}%`);

/** Request types the model got right less than half the time, weakest first - the tab's headline. */
export function weakToolCategories(run: EvalRun | undefined): { name: string; passRate: number; n: number }[] {
  const byCategory = ((run?.details ?? {}) as ToolRunDetails).byCategory ?? {};
  return Object.entries(byCategory)
    .filter(([, v]) => v.passRate < 0.5)
    .sort((a, b) => a[1].passRate - b[1].passRate)
    .map(([cat, v]) => ({ name: CATEGORY_NAME[cat] ?? cat, passRate: v.passRate, n: v.n }));
}
const modelName = (m?: string) => (m?.includes("llama-3.3-70b") ? "Llama 3.3 70B" : (m?.split("/").pop() ?? "a Workers AI model"));

function Stat({ label, value, plain }: { label: string; value: string; plain: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-text">{value}</div>
      <p className="mt-2.5 border-t border-border pt-2.5 text-[0.8rem] leading-snug text-text/80">{plain}</p>
    </div>
  );
}

export function ToolSelection({ run }: { run: EvalRun | undefined }) {
  if (!run) {
    return (
      <p className="max-w-2xl text-sm text-muted">
        No run recorded yet. It&apos;s started by hand from{" "}
        <code className="rounded bg-surface-raised px-1.5 py-0.5">eval-mcp-tools.yml</code>.
      </p>
    );
  }
  const d = (run.details ?? {}) as ToolRunDetails;
  const categories = Object.entries(d.byCategory ?? {});
  const misses = d.misses ?? [];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Pass rate"
          value={pct(run.metrics.passRate)}
          plain={`Of ${run.n} test requests, the share where the model did exactly the right thing.`}
        />
        <Stat label="Right tool" value={pct(run.metrics.toolAccuracy)} plain="Picked the right tool - or rightly used none for an off-topic question." />
        <Stat label="Right arguments" value={pct(run.metrics.argAccuracy)} plain="When the tool was right: valid arguments, the right title id or filter, and no filter nobody asked for." />
      </div>

      {categories.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {categories.map(([cat, v]) => (
            <li key={cat} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm sm:flex-nowrap">
              <span className="w-full shrink-0 text-text sm:w-44">{CATEGORY_NAME[cat] ?? cat}</span>
              <span className="hidden flex-1 truncate text-muted sm:block">{CATEGORY_EXAMPLE[cat]}</span>
              <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">
                <span className="font-semibold text-text">{pct(v.passRate)}</span>
                <span className="text-muted"> of {v.n}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {misses.length > 0 && (
        <details className="mt-5 rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
            What it got wrong ({misses.length})
          </summary>
          <ul className="space-y-2.5 px-4 pb-4 text-sm">
            {misses.map((m) => (
              <li key={m.id}>
                <code className="text-xs text-text">{m.id}</code>
                <span className="text-muted">
                  {" "}
                  - expected {m.expected ?? "no tool"}, called{" "}
                  {m.called ? `${m.called.name}(${JSON.stringify(m.called.arguments)})` : "no tool"}.{" "}
                  {m.problems.join("; ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-4 text-xs text-muted">
        Latest run {run.runAt.slice(0, 10)} · {modelName(d.model)} · MCP server {d.serverVersion ? `v${d.serverVersion}` : ""}
        {run.failed > 0 ? ` · ${run.failed} requests not scored (the model call failed)` : ""}
      </p>
    </div>
  );
}
