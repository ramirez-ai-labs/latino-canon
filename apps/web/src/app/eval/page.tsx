import Image from "next/image";
import Link from "next/link";
import { GROUNDEDNESS_MIN_VALID_JUDGE_VERSION, type EvalRun, type Title } from "@latino-canon/core";
import { getTitle, listEvalRuns, posterUrl } from "@/lib/api";
import {
  GATE_MAX_DROP,
  categoryScores,
  describeJudgeFailure,
  failurePatterns,
  gateOf,
  recall5,
  trendPoints,
  type GroundednessDetails,
} from "@/lib/eval-insights";
import { RetrievalTrend } from "@/components/eval/RetrievalTrend";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Eval" };
export const dynamic = "force-dynamic";

/**
 * Leads with what the evals found, not with the run log: four headline numbers, the
 * retrieval trend with its deploy gate, where search is weakest, why blurbs fail and what
 * changed because of it, and the titles to fix first. The run log and methodology fold away
 * below - kept for the record, never deleted, including runs later found invalid.
 */

/**
 * Retrieval and groundedness runs are fetched separately. One mixed "latest 20" list let
 * frequent retrieval runs (one per api deploy - 16 in the three days to 2026-09-27) push
 * every groundedness run out of the window, taking the latest valid score, its
 * lowest-scoring titles and the groundedness history off the page. Groundedness runs are
 * manual and rare, so their whole recent history fits.
 */
const RETRIEVAL_RUNS_SHOWN = 15;
const GROUNDEDNESS_RUNS_SHOWN = 20;
const TITLES_TO_FIX = 6;

const STATUS_GOOD = "#0ca30c";
const STATUS_CRITICAL = "#d03b3b";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// "known-item" -> "Known-item" (CSS `capitalize` gives "Known-Item").
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const signed = (n: number, digits = 3) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

/**
 * Groundedness runs recorded before judge version 2 are kept but labeled invalid: that
 * judge was handed each source's `ref` (a title slug, a director's name) instead of its
 * text, so it never saw the synopsis it was meant to check claims against.
 */
function judgeVersion(r: EvalRun): number {
  return r.metrics.judgeVersion ?? 1;
}

function isInvalid(r: EvalRun): boolean {
  return r.evalType === "groundedness" && judgeVersion(r) < GROUNDEDNESS_MIN_VALID_JUDGE_VERSION;
}

/** Signed change with an arrow, so direction never rides on color alone. */
function Delta({ value, suffix }: { value: number; suffix: string }) {
  const flat = Math.abs(value) < 0.0005;
  return (
    <span className="text-xs text-muted">
      <span aria-hidden style={{ color: flat ? undefined : value > 0 ? STATUS_GOOD : STATUS_CRITICAL }}>
        {flat ? "→" : value > 0 ? "▲" : "▼"}
      </span>{" "}
      {flat ? "no change" : signed(value)} {suffix}
    </span>
  );
}

function Tile({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-text">{value}</div>
      <div className="mt-1.5 space-y-0.5 leading-snug">{children}</div>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {lead && <p className="mt-1 max-w-2xl text-sm text-muted">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Horizontal bar with its value at the tip; `emphasis` dims the rest so one row carries the story. */
function Bar({ fraction, dim }: { fraction: number; dim?: boolean }) {
  return (
    <div className="h-3 flex-1">
      <div
        className="h-3 rounded-r bg-accent-cyan transition-opacity"
        style={{ width: `${Math.max(fraction, 0.01) * 100}%`, opacity: dim ? 0.45 : 1 }}
      />
    </div>
  );
}

export default async function EvalPage() {
  const [retrievalRuns, groundednessRuns] = await Promise.all([
    listEvalRuns(RETRIEVAL_RUNS_SHOWN, "retrieval"),
    listEvalRuns(GROUNDEDNESS_RUNS_SHOWN, "groundedness"),
  ]);
  const runs = [...retrievalRuns.runs, ...groundednessRuns.runs].sort((a, b) => b.runAt.localeCompare(a.runAt));
  const validGroundedness = groundednessRuns.runs.filter((r) => !isInvalid(r));
  const latest = validGroundedness[0];
  const previousSameJudge = validGroundedness.find((r) => r !== latest && latest && judgeVersion(r) === judgeVersion(latest));
  const details = latest?.details as GroundednessDetails | null;

  const retrieval = retrievalRuns.runs[0];
  const previousRetrieval = retrievalRuns.runs[1];
  const gate = retrieval ? gateOf(retrieval) : null;
  const categories = retrieval ? categoryScores(retrieval) : [];
  const weakest = categories[0];
  const strongest = categories[categories.length - 1];
  const points = trendPoints(retrievalRuns.runs);
  const patterns = details?.worst ? failurePatterns(details.worst) : [];
  const failing = patterns.reduce((sum, p) => sum + p.count, 0);
  const hasInvalid = runs.some(isInvalid);

  // Titles to fix: the lowest scorers as real films - title, poster, page - not slugs.
  const worst = (details?.worst ?? []).slice(0, TITLES_TO_FIX);
  const worstTitles = await Promise.all(worst.map((w) => getTitle(w.titleId).catch((): Title | null => null)));

  if (runs.length === 0) {
    return (
      <article className="max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Evals</h1>
        <p className="text-muted">No eval runs recorded yet.</p>
      </article>
    );
  }

  return (
    <article className="max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">Evals</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Every api deploy is checked against {retrieval?.n ?? "a set of"} real search queries, and blurbs are checked claim by claim against
        the sources they were written from. This page shows what those checks find.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {retrieval && recall5(retrieval) != null && (
          <Tile label="Search recall@5" value={recall5(retrieval)!.toFixed(3)}>
            {previousRetrieval && recall5(previousRetrieval) != null && (
              <Delta value={recall5(retrieval)! - recall5(previousRetrieval)!} suffix="vs previous run" />
            )}
            <div className="text-xs text-muted">{retrieval.n} golden queries, hybrid</div>
          </Tile>
        )}
        {gate && gate.status !== "none" && (
          <Tile
            label="Deploy gate"
            value={
              <span className="flex items-center gap-2">
                <span aria-hidden style={{ color: gate.status === "pass" ? STATUS_GOOD : STATUS_CRITICAL }}>
                  {gate.status === "pass" ? "✓" : "✕"}
                </span>
                {gate.status === "pass" ? "Passed" : "Failed"}
              </span>
            }
          >
            {gate.delta != null && (
              <div className="text-xs text-muted">
                {signed(gate.delta)} vs last passing run (limit −{GATE_MAX_DROP.toFixed(2)})
              </div>
            )}
          </Tile>
        )}
        {latest?.meanScore != null && (
          <Tile label="Blurb groundedness" value={latest.meanScore.toFixed(3)}>
            {previousSameJudge?.meanScore != null && (
              <Delta value={latest.meanScore - previousSameJudge.meanScore} suffix="vs previous run" />
            )}
            <div className="text-xs text-muted">
              {latest.n} blurbs, judge v{judgeVersion(latest)}
            </div>
          </Tile>
        )}
        {weakest && strongest && weakest !== strongest && (
          <Tile label="Weakest query type" value={sentenceCase(weakest.category)}>
            <div className="text-xs text-muted">
              recall@5 {weakest.recall5.toFixed(3)}, against {strongest.recall5.toFixed(3)} for {strongest.category}
            </div>
          </Tile>
        )}
      </div>

      {points.length >= 2 && (
        <Section
          title="Search quality over time"
          lead={
            <>
              Hybrid recall@5 across the last {points.length} retrieval runs, one after every api deploy. A run fails
              the deploy gate when it drops more than {GATE_MAX_DROP} below the last passing run.
            </>
          }
        >
          <div className="rounded-xl border border-border bg-surface p-4">
            <RetrievalTrend points={points} />
          </div>
        </Section>
      )}

      {categories.length > 0 && (
        <Section
          title="Where search is weakest"
          lead="Recall@5 by query type in the latest run: the share of each query's correct titles found in the top 5. Weakest first."
        >
          <ul className="space-y-3">
            {categories.map((c) => (
              <li key={c.category} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-text">{sentenceCase(c.category)}</span>
                <Bar fraction={c.recall5} dim={c !== weakest} />
                <span className="shrink-0 whitespace-nowrap text-right tabular-nums">
                  <span className="font-semibold text-text">{c.recall5.toFixed(3)}</span>
                  <span className="text-muted"> · MRR {c.mrr?.toFixed(2) ?? "—"}</span>
                </span>
              </li>
            ))}
          </ul>
          {weakest?.category === "spanish" && (
            <p className="mt-4 max-w-2xl text-sm text-muted">
              Spanish queries are mostly translations of English plot queries that pass. The bilingual search plan
              is next on the{" "}
              <a href="https://github.com/ramirez-ai-labs/latino-canon/blob/main/docs/ROADMAP.md" className="text-accent hover:underline">
                roadmap
              </a>
              .
            </p>
          )}
        </Section>
      )}

      {latest && patterns.length > 0 && (
        <Section
          title="Why blurbs fail"
          lead={
            <>
              In the latest groundedness run, {failing} of {latest.n} blurbs had a claim the judge couldn&apos;t match
              to a source. Grouped by what went wrong:
            </>
          }
        >
          <ul className="space-y-5">
            {patterns.map((p) => (
              <li key={p.key}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm sm:flex-nowrap">
                  <span className="w-full text-text sm:w-64 sm:shrink-0">{p.label}</span>
                  <Bar fraction={p.count / failing} dim={p !== patterns[0]} />
                  <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-text">{p.count}</span>
                </div>
                <div className="mt-1.5 text-sm text-muted sm:pl-[16.75rem]">
                  {p.example && <span className="italic">“{p.example}”</span>} {p.response}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {worst.length > 0 && (
        <Section
          title="Titles to fix first"
          lead="The lowest-scoring blurbs and the claim the judge flagged. A flag means no source states the claim, not that it's false."
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {worst.map((w, i) => {
              const t = worstTitles[i];
              return (
                <li key={w.titleId}>
                  <Link
                    href={`/title/${w.titleId}`}
                    className="flex gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent-cyan/60"
                  >
                    <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-surface-raised">
                      {t?.posterKey && <Image src={posterUrl(t.posterKey)} alt="" fill sizes="64px" className="object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <strong className="truncate text-text">{t ? t.title : w.titleId}</strong>
                        {t && <span className="shrink-0 text-xs text-muted">{t.yearStart}</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">score {w.score.toFixed(2)}</div>
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted">“{w.unsupported[0]}”</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <details className="group mt-12 rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 font-semibold">How these evals work</summary>
        <div className="space-y-3 px-4 pb-4 text-sm text-muted">
          <p>
            <strong className="text-text">Retrieval</strong> runs the {retrieval?.n ?? ""}-query golden set (known titles, people,
            half-remembered plots, facets, Spanish) against the live api after every deploy and weekly. Recall@5 is the
            share of each query&apos;s correct titles in the top 5; MRR is how high the first one ranks.
          </p>
          <p>
            <strong className="text-text">Groundedness</strong> gives a 70B LLM judge each blurb and the sources it was
            written from, and scores the share of its claims a source supports. Runs are started by hand from{" "}
            <code className="rounded bg-surface-raised px-1.5 py-0.5">eval-groundedness.yml</code>. The same judge
            gates new blurbs at ingest: only a fully supported, properly cited blurb is approved without an editor.
          </p>
          {hasInvalid && (
            <p>
              <strong className="text-text">Runs marked invalid stay on the record.</strong> Their judge was given each
              source&apos;s reference (a title slug and a director&apos;s name) instead of its text, so it never saw the
              synopsis, and it ran at a non-zero temperature. Scores only compare within one judge version.
            </p>
          )}
          {details?.failures && details.failures.length > 0 && (
            <p>
              <strong className="text-text">Unscored in the latest run:</strong>{" "}
              {details.failures.map((f) => `${f.titleId} (${describeJudgeFailure(f.error)})`).join("; ")}
            </p>
          )}
        </div>
      </details>

      <details className="mt-3 rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 font-semibold">Run log ({runs.length} runs)</summary>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-4 font-medium">Run</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Judge</th>
                <th className="py-2 pr-4 text-right font-medium">n</th>
                <th className="py-2 pr-4 text-right font-medium">Failed</th>
                <th className="py-2 text-right font-medium" title="Retrieval: hybrid recall@5. Groundedness: mean share of supported claims.">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">{formatDate(r.runAt)}</td>
                  <td className="py-2 pr-4">{r.evalType}</td>
                  <td className="py-2 pr-4 text-muted">{r.evalType === "groundedness" ? `v${judgeVersion(r)}` : "—"}</td>
                  <td className="py-2 pr-4 text-right">{r.n}</td>
                  <td className="py-2 pr-4 text-right">{r.failed}</td>
                  <td className="py-2 text-right font-medium">
                    {isInvalid(r) ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-muted line-through">{r.meanScore?.toFixed(3) ?? "—"}</span>
                        <Badge title="Judge never saw the source text - see How these evals work">invalid</Badge>
                      </span>
                    ) : (
                      (r.meanScore?.toFixed(3) ?? "—")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}
