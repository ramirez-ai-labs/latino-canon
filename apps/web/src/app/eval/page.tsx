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
import { ToolSelection, weakToolCategories } from "@/components/eval/ToolSelection";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Eval" };
export const dynamic = "force-dynamic";

/**
 * Four stories - search quality, blurb quality, the daily blurb check, AI assistants - each
 * on its own tab (`/eval?tab=…`, server-rendered, so every view is linkable and needs no
 * client JS). A summary strip on top gives one number per story and links to its tab; each
 * tab leads with one plain sentence saying what its numbers mean, then its main chart, with
 * details folded away. It used to be one long scroll that ran the four together, with the
 * definitions at the top, far from the numbers they explain.
 *
 * Methodology, glossary and the run log stay at the bottom of every tab - kept for the
 * record, never deleted, including runs later found invalid.
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
const TITLES_SHOWN_FIRST = 3;

const STATUS_GOOD = "#0ca30c";
const STATUS_CRITICAL = "#d03b3b";

const TABS = [
  { key: "search", label: "Search" },
  { key: "blurbs", label: "Blurbs" },
  { key: "daily", label: "Daily check" },
  { key: "assistants", label: "AI assistants" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const isTab = (v: string | undefined): v is TabKey => TABS.some((t) => t.key === v);

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
const pct = (x: number) => `${Math.round(x * 100)}%`;

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

/** One number per story, linking to its tab. The active tab's tile is outlined. */
function SummaryTile({
  tab,
  active,
  label,
  value,
  line,
}: {
  tab: TabKey;
  active: boolean;
  label: string;
  value: React.ReactNode;
  line: React.ReactNode;
}) {
  return (
    <Link
      href={`/eval?tab=${tab}`}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col rounded-xl border bg-surface px-4 py-3.5 transition-colors hover:border-accent-cyan/60 ${
        active ? "border-accent-cyan" : "border-border"
      }`}
    >
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-1 text-3xl font-semibold tracking-tight text-text">{value}</span>
      <span className="mt-1.5 text-xs leading-snug text-muted">{line}</span>
    </Link>
  );
}

/** The tab's one-sentence takeaway, then an optional plain definition of its metric. */
function Headline({ children, define }: { children: React.ReactNode; define?: React.ReactNode }) {
  return (
    <div className="mb-6 max-w-2xl">
      <p className="text-lg leading-snug text-text">{children}</p>
      {define && <p className="mt-2 text-sm text-muted">{define}</p>}
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

// The same types inside a sentence: "Searches by person are the weakest".
const QUERY_TYPE_IN_SENTENCE: Record<string, string> = {
  facet: "Genre, era or kind searches",
  "known-item": "Exact-title searches",
  person: "Searches by person",
  plot: "Searches by plot",
  spanish: "Searches in Spanish",
};

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
    <section className="mt-10 first:mt-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {lead && <p className="mt-1 max-w-2xl text-sm text-muted">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Horizontal bar with its value at the tip; `dim` fades the rest so one row carries the story. */
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

function TitleToFix({ w, t }: { w: { titleId: string; score: number; unsupported: string[] }; t: Title | null }) {
  return (
    <li>
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
}

export default async function EvalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab: TabKey = isTab(sp.tab) ? sp.tab : "search";

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
  const r5 = retrieval ? recall5(retrieval) : null;

  const judgedDays = gateDaily.days.filter((d) => d.judged > 0);
  const gateTotals = judgedDays.reduce((t, d) => ({ judged: t.judged + d.judged, approved: t.approved + d.approved }), { judged: 0, approved: 0 });

  const toolRun = toolRuns.runs[0];
  const weakTools = weakToolCategories(toolRun);

  // Titles to fix: the lowest scorers as real films - title, poster, page - not slugs. Only
  // the Blurbs tab shows them, so only it pays for the title lookups.
  const worst = tab === "blurbs" ? (details?.worst ?? []).slice(0, TITLES_TO_FIX) : [];
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
        How well search finds the right title, whether each &ldquo;why it matters&rdquo; note is backed by its sources, and
        whether AI assistants use the canon correctly - measured after every change, and recorded here.
      </p>

      {/* One number per story; each tile opens its tab. */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          tab="search"
          active={tab === "search"}
          label="Search recall@5"
          value={r5 != null ? r5.toFixed(3) : "—"}
          line={
            gate && gate.status !== "none" ? (
              <>
                <span aria-hidden style={{ color: gate.status === "pass" ? STATUS_GOOD : STATUS_CRITICAL }}>
                  {gate.status === "pass" ? "✓" : "✕"}
                </span>{" "}
                Deploy gate {gate.status === "pass" ? "passed" : "failed"}
              </>
            ) : (
              "New baseline"
            )
          }
        />
        <SummaryTile
          tab="blurbs"
          active={tab === "blurbs"}
          label="Blurb groundedness"
          value={latest?.meanScore != null ? latest.meanScore.toFixed(3) : "—"}
          line={latest ? `${latest.n} blurbs, judge v${judgeVersion(latest)}` : "No valid run yet"}
        />
        <SummaryTile
          tab="daily"
          active={tab === "daily"}
          label="New blurbs approved"
          value={gateTotals.judged > 0 ? pct(gateTotals.approved / gateTotals.judged) : "—"}
          line={
            gateTotals.judged > 0
              ? `${gateTotals.approved} of ${gateTotals.judged} over ${judgedDays.length} ${judgedDays.length === 1 ? "day" : "days"}`
              : "No blurbs judged yet"
          }
        />
        <SummaryTile
          tab="assistants"
          active={tab === "assistants"}
          label="AI assistant pass rate"
          value={toolRun?.metrics.passRate != null ? pct(toolRun.metrics.passRate) : "—"}
          line={toolRun ? `${toolRun.n} test requests` : "No run yet"}
        />
      </div>

      <nav aria-label="Eval sections" className="mt-8 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/eval?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm transition-colors ${
              tab === t.key ? "border-accent-cyan font-semibold text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        {tab === "search" && (
          <>
            {weakest && strongest && weakest !== strongest && (
              <Headline
                define={
                  <>
                    <strong className="text-text">Recall@5</strong> is the share of our {retrieval?.n ?? ""} test searches whose
                    right answer lands in the top 5 results - for example{" "}
                    <em>&ldquo;dos estafadores venden estampillas falsas a un coleccionista&rdquo;</em> →{" "}
                    <Link href="/title/nine-queens-2000" className="text-accent hover:underline">
                      <em>Nine Queens</em>
                    </Link>
                    . <strong className="text-text">MRR</strong> is how high it ranks: 1 for first place, ½ for second.
                  </>
                }
              >
                {r5 != null && <>About {Math.round(r5 * 100)} of every 100 test searches find the right title in the top 5. </>}
                <strong>{QUERY_TYPE_IN_SENTENCE[weakest.category] ?? queryTypeName(weakest.category)}</strong> are the weakest
                ({pct(weakest.recall5)} in the top 5), like &ldquo;{EXAMPLE_QUERY[weakest.category] ?? weakest.category}&rdquo;.
              </Headline>
            )}

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
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {previousRetrieval && r5 != null && recall5(previousRetrieval) != null && (
                    <Delta value={r5 - recall5(previousRetrieval)!} suffix="vs previous run" />
                  )}
                  {gate && gate.status !== "none" && gate.delta != null && (
                    <span className="text-xs text-muted">
                      {signed(gate.delta)} vs last passing run (gate limit −{GATE_MAX_DROP.toFixed(2)})
                    </span>
                  )}
                </p>
              </Section>
            )}

            {categories.length > 0 && (
              <Section title="Where search is weakest" lead="Recall@5 by search type in the latest run. Weakest first.">
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
              </Section>
            )}
          </>
        )}

        {tab === "blurbs" && (
          <>
            {latest?.meanScore != null ? (
              <Headline
                define={
                  <>
                    <strong className="text-text">Groundedness</strong>: an AI judge checks each note, claim by claim, against
                    the sources it was written from (synopsis, credits, awards). 1.0 means every claim is backed.
                  </>
                }
              >
                On average, {pct(latest.meanScore)} of a note&apos;s claims are backed by its sources.
                {patterns[0] && (
                  <>
                    {" "}
                    The most common problem: <strong>{patterns[0].label.toLowerCase()}</strong> ({patterns[0].count} of{" "}
                    {latest.n} notes).
                  </>
                )}
                {previousSameJudge?.meanScore != null && (
                  <span className="ml-2 align-middle">
                    <Delta value={latest.meanScore - previousSameJudge.meanScore} suffix="vs previous run" />
                  </span>
                )}
              </Headline>
            ) : (
              <Headline>No valid groundedness run recorded yet.</Headline>
            )}

            {latest && patterns.length > 0 && (
              <Section
                title="Why blurbs fail"
                lead={
                  <>
                    In the latest run, {failing} of {latest.n} notes had a claim the judge couldn&apos;t match to a source,
                    grouped by what went wrong.
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
                lead="The lowest-scoring notes and the claim the judge flagged. A flag means no source states the claim, not that it's false."
              >
                <ul className="grid gap-3 sm:grid-cols-2">
                  {worst.slice(0, TITLES_SHOWN_FIRST).map((w, i) => (
                    <TitleToFix key={w.titleId} w={w} t={worstTitles[i] ?? null} />
                  ))}
                </ul>
                {worst.length > TITLES_SHOWN_FIRST && (
                  <details className="mt-3">
                    <summary className="cursor-pointer select-none text-sm text-accent">
                      Show {worst.length - TITLES_SHOWN_FIRST} more
                    </summary>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                      {worst.slice(TITLES_SHOWN_FIRST).map((w, i) => (
                        <TitleToFix key={w.titleId} w={w} t={worstTitles[i + TITLES_SHOWN_FIRST] ?? null} />
                      ))}
                    </ul>
                  </details>
                )}
              </Section>
            )}
          </>
        )}

        {tab === "daily" && (
          <>
            <Headline
              define={
                <>
                  Every new note is judged at ingest by the same groundedness judge and shown only when every claim is
                  supported and properly cited; the rest are <strong className="text-text">held for an editor</strong>. This
                  record costs nothing extra - a full groundedness run spends about a quarter of the day&apos;s AI budget.
                </>
              }
            >
              {gateTotals.judged > 0 ? (
                <>
                  The judge approved {gateTotals.approved} of {gateTotals.judged} new notes ({pct(gateTotals.approved / gateTotals.judged)})
                  over the last {judgedDays.length} {judgedDays.length === 1 ? "day" : "days"}; the rest wait for an editor.
                </>
              ) : (
                <>No new notes judged yet.</>
              )}
            </Headline>
            {gateDaily.days.length > 0 && (
              <Section title="New blurbs, checked daily">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <BlurbGateDaily days={gateDaily.days} />
                </div>
              </Section>
            )}
          </>
        )}

        {tab === "assistants" && (
          <>
            <Headline
              define={
                <>
                  The canon is also an MCP server that Claude, ChatGPT or Cursor can connect to. The server calls no model -
                  the assistant brings its own - so its tool names and descriptions are all an assistant has to go on. This
                  test gives a model only those, plus a request, and checks what it calls.
                </>
              }
            >
              {toolRun?.metrics.passRate != null ? (
                <>
                  A model handled {pct(toolRun.metrics.passRate)} of {toolRun.n} test requests exactly right.
                  {weakTools.length > 0 && (
                    <>
                      {" "}
                      Weakest:{" "}
                      {weakTools.map((c, i) => (
                        <span key={c.name}>
                          {i > 0 && (i === weakTools.length - 1 ? " and " : ", ")}
                          &ldquo;<strong>{c.name}</strong>&rdquo; ({pct(c.passRate)} of {c.n})
                        </span>
                      ))}
                      .
                    </>
                  )}
                </>
              ) : (
                <>No tool-selection run recorded yet.</>
              )}
            </Headline>
            <Section title="AI assistants using the canon">
              <ToolSelection run={toolRun} />
            </Section>
          </>
        )}
      </div>

      <div className="mt-14 space-y-3">
        <details className="rounded-xl border border-border bg-surface">
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

        <details className="rounded-xl border border-border bg-surface">
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

        <details className="rounded-xl border border-border bg-surface">
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
      </div>
    </article>
  );
}
