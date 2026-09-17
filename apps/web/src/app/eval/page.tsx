import type { EvalRun } from "@latino-canon/core";
import { listEvalRuns } from "@/lib/api";

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
    <article style={{ maxWidth: 800 }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Eval History</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1.5rem" }}>
        Results from <code>packages/eval</code>, written by CI on every manual run of{" "}
        <code>.github/workflows/eval-groundedness.yml</code>.
      </p>

      {runs.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No eval runs recorded yet.</p>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--surface)" }}>
                <th style={{ padding: "0.5rem" }}>Run</th>
                <th style={{ padding: "0.5rem" }}>Type</th>
                <th style={{ padding: "0.5rem" }}>n</th>
                <th style={{ padding: "0.5rem" }}>Failed</th>
                <th style={{ padding: "0.5rem" }}>Mean score</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r: EvalRun) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--surface)" }}>
                  <td style={{ padding: "0.5rem" }}>{formatDate(r.runAt)}</td>
                  <td style={{ padding: "0.5rem" }}>{r.evalType}</td>
                  <td style={{ padding: "0.5rem" }}>{r.n}</td>
                  <td style={{ padding: "0.5rem", color: r.failed > 0 ? "var(--accent)" : undefined }}>{r.failed}</td>
                  <td style={{ padding: "0.5rem" }}>{r.meanScore?.toFixed(3) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {latest && details?.worst && details.worst.length > 0 && (
            <>
              <h2 style={{ marginBottom: "0.5rem" }}>Lowest-scoring titles (latest run)</h2>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
                A low score usually flags a claim the judge couldn&apos;t match to a cited
                source — not necessarily a factual error. See{" "}
                <a
                  href="https://github.com/ramirez-ai-labs/latino-canon/blob/main/ROADMAP.md"
                  style={{ color: "var(--accent)" }}
                >
                  ROADMAP.md
                </a>{" "}
                for the open question on separating factual claims from editorial framing.
              </p>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
                {details.worst.slice(0, 15).map((w) => (
                  <li key={w.titleId} style={{ background: "var(--surface)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{w.titleId}</strong>
                      <span style={{ color: "var(--muted)" }}>{w.score.toFixed(2)}</span>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      {w.unsupported.join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {latest && details?.failures && details.failures.length > 0 && (
            <>
              <h2 style={{ margin: "2rem 0 0.5rem" }}>Failed judge calls (latest run)</h2>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
                {details.failures.map((f) => (
                  <li key={f.titleId} style={{ fontSize: "0.85rem" }}>
                    <strong>{f.titleId}</strong>
                    <span style={{ color: "var(--muted)" }}> — {f.error}</span>
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
