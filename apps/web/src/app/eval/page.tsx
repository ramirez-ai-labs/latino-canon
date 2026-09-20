import type { EvalRun } from "@latino-canon/core";
import { listEvalRuns } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Eval" };
export const dynamic = "force-dynamic";

interface GroundednessDetails {
  worst?: { titleId: string; score: number; unsupported: string[] }[];
  failures?: { titleId: string; error: string }[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function EvalPage() {
  const { runs } = await listEvalRuns(20);
  const latest = runs[0];
  const details = latest?.details as GroundednessDetails | null;

  return (
    <article className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Eval History</h1>
      <p className="mb-6 text-sm text-muted">
        Results from <code className="rounded bg-surface-raised px-1.5 py-0.5">packages/eval</code>&apos;s groundedness judge. This history only
        grows when someone manually triggers{" "}
        <code className="rounded bg-surface-raised px-1.5 py-0.5">.github/workflows/eval-groundedness.yml</code> from GitHub Actions — it does
        not run automatically on every PR or commit.
      </p>

      {runs.length === 0 ? (
        <p className="text-muted">No eval runs recorded yet.</p>
      ) : (
        <>
          <div className="mb-10 overflow-hidden rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-muted">
                  <th className="px-4 py-2.5 font-medium">Run</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">n</th>
                  <th className="px-4 py-2.5 font-medium">Failed</th>
                  <th className="px-4 py-2.5 font-medium">Mean score</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r: EvalRun) => (
                  <tr key={r.id} className="border-b border-border last:border-0 odd:bg-surface/40">
                    <td className="px-4 py-2.5">{formatDate(r.runAt)}</td>
                    <td className="px-4 py-2.5">{r.evalType}</td>
                    <td className="px-4 py-2.5">{r.n}</td>
                    <td className={`px-4 py-2.5 ${r.failed > 0 ? "text-accent" : ""}`}>{r.failed}</td>
                    <td className="px-4 py-2.5 font-medium">{r.meanScore?.toFixed(3) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {latest && details?.worst && details.worst.length > 0 && (
            <>
              <h2 className="mb-1.5 text-lg font-semibold">Lowest-scoring titles (latest run)</h2>
              <p className="mb-3 text-sm text-muted">
                A low score usually flags a claim the judge couldn&apos;t match to a cited
                source — not necessarily a factual error. See{" "}
                <a
                  href="https://github.com/ramirez-ai-labs/latino-canon/blob/main/docs/ROADMAP.md"
                  className="text-accent hover:underline"
                >
                  ROADMAP.md
                </a>{" "}
                for the open question on separating factual claims from editorial framing.
              </p>
              <ul className="grid gap-2.5">
                {details.worst.slice(0, 15).map((w) => (
                  <li key={w.titleId} className="rounded-lg bg-surface px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="truncate text-[0.9rem]">{w.titleId}</strong>
                      <Badge>{w.score.toFixed(2)}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted">{w.unsupported.join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {latest && details?.failures && details.failures.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-lg font-semibold">Failed judge calls (latest run)</h2>
              <ul className="grid gap-1.5">
                {details.failures.map((f) => (
                  <li key={f.titleId} className="text-sm">
                    <strong>{f.titleId}</strong>
                    <span className="text-muted"> — {f.error}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </article>
  );
}
