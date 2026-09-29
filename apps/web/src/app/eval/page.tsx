import Image from "next/image";
import Link from "next/link";
import { GROUNDEDNESS_MIN_VALID_JUDGE_VERSION, type EvalRun, type Title } from "@latino-canon/core";
import { getBlurbGateDaily, getTitle, listEvalRuns, posterUrl } from "@/lib/api";
import {
  GATE_MAX_DROP,
  categoryScores,
  describeJudgeFailure,
  failurePatterns,
  gateOf,
  goldenSetHash,
  recall5,
  trendPoints,
  type GroundednessDetails,
} from "@/lib/eval-insights";
import { BlurbGateDaily } from "@/components/eval/BlurbGateDaily";
import { RetrievalTrend } from "@/components/eval/RetrievalTrend";
import { ToolSelection } from "@/components/eval/ToolSelection";
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

/** The terms this page uses, in plain words. Collapsed by default: beginners open it, experts skip it. */
const GLOSSARY: [string, string][] = [
  ["Golden set", "Our test searches, each with the title(s) a good search should return, checked by hand against the live catalog."],
  [
    "Search types",
    "How the test searches are grouped: exact title (\"Selena\"; engineers call it known-item), by person (a director or actor), by plot (a half-remembered story), genre, era or kind (\"Mexican family stories from the 90s\"; called facet), and in Spanish.",
  ],
  ["Recall@5", "The share of test searches whose right answer appears in the top 5 results."],
  ["MRR", "Mean reciprocal rank: how high the first right answer ranks - 1 for first place, ½ for second, ⅓ for third - averaged over all searches."],
  ["Hybrid search", "Two searches combined: keyword matching (BM25), which finds exact words, and meaning matching (embeddings), which finds related ideas even in other words or languages."],
  ["Deploy gate", "The rule that re-runs the tests after every code change and flags it if recall@5 drops more than 0.03 below the last passing run."],
  ["Baseline", "The run a new one is compared against. Changing the golden set starts a new baseline, because scores only compare on the same tests."],
  ["Groundedness", "The share of a note's claims that its cited sources (the synopsis, credits, awards) actually support."],
  ["LLM judge", "An AI model (Llama 3.3 70B) that reads a note and its sources and lists any claim no source backs. Its version is frozen, so scores stay comparable."],
  ["Approved by the judge", "A new note the judge found fully supported and properly cited, so it's shown without waiting for a person."],
  ["Held for an editor", "A note with at least one unsupported claim. It isn't shown until an editor approves it, or a rewrite passes."],
  [
    "Tool selection (MCP)",
    "Whether an AI assistant connected to our MCP server picks the right tool for a request - search, open a title, more like this, recommend - with the right details, or rightly uses none.",
  ],
  ["Invalid run", "A past run we found was measuring the wrong thing. It stays on the record, labeled, rather than being deleted."],
];

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

/**
 * A headline number with its expert detail (children) and, for readers new to evals, one
 * plain-language sentence saying what the number means. The metric's real name stays in
 * the label, so the page teaches the vocabulary rather than hiding it.
 */
function Tile({ label, value, plain, children }: { label: string; value: React.ReactNode; plain?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="text-xs text-muted">{label}</div>
      {/* Numbers read big; a word value like "Genre, era or kind" steps down so it fits one line. */}
      <div
        className={`mt-1 font-semibold tracking-tight text-text ${typeof value === "string" && value.length > 12 ? "text-2xl" : "text-3xl"}`}
      >
        {value}
      </div>
      <div className="mt-1.5 space-y-0.5 leading-snug">{children}</div>
      {plain && <p className="mt-2.5 border-t border-border pt-2.5 text-[0.8rem] leading-snug text-text/80">{plain}</p>}
    </div>
  );
}

// Query types by what a reader would call them. The golden set's category keys ("facet",
// "known-item") are search-engineering jargon; the glossary maps the two.
const QUERY_TYPE_NAME: Record<string, string> = {
  facet: "Genre, era or kind",
  "known-item": "Exact title",
  person: "By person",
  plot: "By plot",
  spanish: "In Spanish",
};
const queryTypeName = (category: string) => QUERY_TYPE_NAME[category] ?? sentenceCase(category);

// One real golden-set query per type, so "the weakest type" reads as a search people make.
const EXAMPLE_QUERY: Record<string, string> = {
  facet: "Mexican family stories from the 90s",
  "known-item": "Selena",
  plot: "coming of age at the border",
  person: "Lin-Manuel Miranda musical Washington Heights",
  spanish: "películas de Gregory Nava",
};

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
  const [retrievalRuns, groundednessRuns, gateDaily, toolRuns] = await Promise.all([
    listEvalRuns(RETRIEVAL_RUNS_SHOWN, "retrieval"),
    listEvalRuns(GROUNDEDNESS_RUNS_SHOWN, "groundedness"),
    getBlurbGateDaily(14).catch(() => ({ days: [] })),
    listEvalRuns(1, "mcp-tools").catch(() => ({ runs: [] })),
  ]);
  const runs = [...retrievalRuns.runs, ...groundednessRuns.runs].sort((a, b) => b.runAt.localeCompare(a.runAt));
  const validGroundedness = groundednessRuns.runs.filter((r) => !isInvalid(r));
  const latest = validGroundedness[0];
  const previousSameJudge = validGroundedness.find((r) => r !== latest && latest && judgeVersion(r) === judgeVersion(latest));
  const details = latest?.details as GroundednessDetails | null;

  const retrieval = retrievalRuns.runs[0];
  // Compare only within one golden set: the 77 -> 97 query change moved recall with no
  // ranking change at all, and the gate itself never compares across sets.
  const previousRetrieval = retrieval
    ? retrievalRuns.runs.slice(1).find((r) => goldenSetHash(r) === goldenSetHash(retrieval))
    : undefined;
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

      {/* For readers new to evals: what the three numbers mean, on one real test search. */}
      <section aria-labelledby="how-to-read" className="mt-6 max-w-3xl rounded-xl border border-border bg-surface px-5 py-4">
        <h2 id="how-to-read" className="text-base font-semibold">
          How to read this page
        </h2>
        <p className="mt-1.5 text-sm text-text/85">
          We keep {retrieval?.n ?? "a set of"} test searches with known right answers, like{" "}
          <em>&ldquo;dos estafadores venden estampillas falsas a un coleccionista&rdquo;</em> →{" "}
          <Link href="/title/nine-queens-2000" className="text-accent hover:underline">
            <em>Nine Queens</em>
          </Link>
          . After every code change we run all of them and look at where the right answer lands.
        </p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-text">Recall@5</dt>
            <dd className="mt-0.5 text-text/80">Did the right answer make the top 5 results? The share of searches where it did.</dd>
          </div>
          <div>
            <dt className="font-semibold text-text">MRR</dt>
            <dd className="mt-0.5 text-text/80">
              How high it ranked: first place scores 1, second ½, third ⅓, and so on, averaged over every search.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Groundedness</dt>
            <dd className="mt-0.5 text-text/80">
              An AI judge checks each &ldquo;why it matters&rdquo; note against the sources it was written from. 1.0 means every
              claim is backed up.
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {retrieval && recall5(retrieval) != null && (
          <Tile
            label="Search recall@5"
            value={recall5(retrieval)!.toFixed(3)}
            plain={<>About {Math.round(recall5(retrieval)! * 100)} of every 100 test searches find the right title in the top 5 results.</>}
          >
            {previousRetrieval && recall5(previousRetrieval) != null ? (
              <Delta value={recall5(retrieval)! - recall5(previousRetrieval)!} suffix="vs previous run" />
            ) : (
              <div className="text-xs text-muted">First run on a new query set</div>
            )}
            <div className="text-xs text-muted">{retrieval.n} golden queries, hybrid</div>
          </Tile>
        )}
        {gate && gate.status === "none" && (
          <Tile
            label="Deploy gate"
            value="Baseline"
            plain="The test set just changed, so this run sets the bar the next code change must meet."
          >
            <div className="text-xs text-muted">First run on a new query set; the next deploy is gated against it</div>
          </Tile>
        )}
        {gate && gate.status !== "none" && (
          <Tile
            label="Deploy gate"
            plain={`Every code change re-runs the tests. If search gets worse by more than ${GATE_MAX_DROP}, the change is flagged.`}
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
          <Tile
            label="Blurb groundedness"
            value={latest.meanScore.toFixed(3)}
            plain={<>On average, {Math.round(latest.meanScore * 100)}% of the claims in a &ldquo;why it matters&rdquo; note are backed by its sources.</>}
          >
            {previousSameJudge?.meanScore != null && (
              <Delta value={latest.meanScore - previousSameJudge.meanScore} suffix="vs previous run" />
            )}
            <div className="text-xs text-muted">
              {latest.n} blurbs, judge v{judgeVersion(latest)}
            </div>
          </Tile>
        )}
        {weakest && strongest && weakest !== strongest && (
          <Tile
            label="Weakest search type"
            value={queryTypeName(weakest.category)}
            plain={EXAMPLE_QUERY[weakest.category] ? <>Searches like &ldquo;{EXAMPLE_QUERY[weakest.category]}&rdquo; are the hardest for us right now.</> : undefined}
          >
            <div className="text-xs text-muted">
              recall@5 {weakest.recall5.toFixed(3)}, against {strongest.recall5.toFixed(3)} for {queryTypeName(strongest.category).toLowerCase()}
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

      {gateDaily.days.length > 0 && (
        <Section
          title="New blurbs, checked daily"
          lead="Every new blurb is judged at ingest by the same groundedness judge, and approved only when every claim is supported and properly cited; the rest wait for an editor. This is the gate's daily record, at no extra cost - a full groundedness run spends about a quarter of the day's AI budget."
        >
          <div className="rounded-xl border border-border bg-surface p-4">
            <BlurbGateDaily days={gateDaily.days} />
          </div>
        </Section>
      )}

      {categories.length > 0 && (
        <Section
          title="Where search is weakest"
          lead="Recall@5 by search type in the latest run: the share of each test search whose right answer is in the top 5. Weakest first."
        >
          <ul className="space-y-3">
            {categories.map((c) => (
              <li key={c.category} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-text">{queryTypeName(c.category)}</span>
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

      <Section
        title="AI assistants using the canon"
        lead={
          <>
            The canon is also an MCP server that Claude, ChatGPT or Cursor can connect to. The server calls no model -
            the assistant brings its own - so its tool names and descriptions are all an assistant has to go on. This
            test gives a model only those, plus a request, and checks what it calls.
          </>
        }
      >
        <ToolSelection run={toolRuns.runs[0]} />
      </Section>

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
          <p>
            <strong className="text-text">Tool selection</strong> connects to the live MCP server like any client,
            reads its instructions and tool list, and gives them to Llama 3.3 70B with each test request (some carry an
            earlier turn, as in &quot;tell me more about the second one&quot;). A request passes when the model calls the
            right tool, or none for an off-topic question, with valid arguments, the expected title id or filter, and
            no search filter the person didn&apos;t ask for - filters exclude, so a guessed one can hide the answer.
            Runs are started by hand from{" "}
            <code className="rounded bg-surface-raised px-1.5 py-0.5">eval-mcp-tools.yml</code>, after a change to a
            tool&apos;s wording.
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
        <summary className="cursor-pointer select-none px-4 py-3 font-semibold">Glossary</summary>
        <dl className="grid gap-x-6 gap-y-3 px-4 pb-4 text-sm sm:grid-cols-[11rem_1fr]">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term} className="contents">
              <dt className="font-semibold text-text">{term}</dt>
              <dd className="text-text/80">{meaning}</dd>
            </div>
          ))}
        </dl>
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
