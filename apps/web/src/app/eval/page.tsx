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
import { pickToolRuns, ToolSelection, weakToolCategories } from "@/components/eval/ToolSelection";
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
const STATUS_WARNING = "#b7791f";

/**
 * Our own targets for each headline number, shown on its tile so a reader new to evals can
 * tell whether a number is good. They're deliberately labeled as ours: there's no industry
 * standard for these metrics, because a score depends on how hard the test set is - recall@5
 * of 0.83 would be poor on exact-title searches and strong on half-remembered plots in two
 * languages. Set 2026-09-30; change them in a PR, like any other public claim.
 */
const TARGETS = {
  search: { min: 0.8, stretch: 0.9, format: (v: number) => v.toFixed(2) },
  notes: { min: 0.9, format: (v: number) => v.toFixed(2) },
  daily: { min: 0.8, format: (v: number) => `${Math.round(v * 100)}%` },
  assistants: { min: 0.9, format: (v: number) => `${Math.round(v * 100)}%` },
} as const;

interface TargetStatus {
  met: boolean;
  label: string;
  context: React.ReactNode;
}

type Target = (typeof TARGETS)[keyof typeof TARGETS];

function targetStatus(value: number | null | undefined, target: Target, context: React.ReactNode): TargetStatus | undefined {
  if (value == null) return undefined;
  return { met: value >= target.min, label: `our target (${target.format(target.min)}+)`, context };
}

const TABS = [
  { key: "search", label: "Search" },
  // "Notes" is what readers call them; the key stays "blurbs" so existing links keep working.
  { key: "blurbs", label: "Notes" },
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

/**
 * One tile per section, doubling as the page's guide: the section's name, the plain
 * question it answers, its headline number, what that number measures, and its status.
 * Each opens its tab; the active one is outlined.
 */
function SummaryTile({
  tab,
  active,
  label,
  question,
  value,
  measures,
  line,
  target,
}: {
  tab: TabKey;
  active: boolean;
  label: string;
  question: string;
  value: React.ReactNode;
  measures: string;
  line: React.ReactNode;
  target?: TargetStatus;
}) {
  return (
    <Link
      href={`/eval?tab=${tab}`}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col rounded-xl border bg-surface px-4 py-3.5 transition-colors hover:border-accent-cyan/60 ${
        active ? "border-accent-cyan" : "border-border"
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-1 text-sm font-medium leading-snug text-text">{question}</span>
      <span className="mt-2 text-3xl font-semibold tracking-tight text-text">{value}</span>
      {/* Is this good? A word and a symbol carry the status, so it never rides on color alone. */}
      {target && (
        <span className="mt-1.5 text-xs font-medium leading-snug" style={{ color: target.met ? STATUS_GOOD : STATUS_WARNING }}>
          <span aria-hidden>{target.met ? "✓" : "!"}</span> {target.met ? "Meets" : "Below"} {target.label}
        </span>
      )}
      <span className="mt-1 text-xs leading-snug text-muted">{measures}</span>
      {target && <span className="mt-1.5 text-xs leading-snug text-text/75">{target.context}</span>}
      <span className="mt-auto pt-2 text-xs leading-snug text-muted">{line}</span>
    </Link>
  );
}

/** How the page stays trustworthy - the reasons its numbers can be taken at face value. */
const HONESTY: [string, string][] = [
  ["Automatic", "The search tests run after every code change; a drop of more than 0.03 flags it."],
  ["Nothing hidden", "Weak results stay on the page - they're the list of what to fix next."],
  ["Comparable", "The AI judge's version is frozen, so a score today compares with one last month."],
  ["On the record", "Runs later found to measure the wrong thing stay here, labeled invalid, not deleted."],
];

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
    // Several: the reference model's latest run and other models' on the same case set.
    listEvalRuns(20, "mcp-tools").catch(() => ({ runs: [] })),
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

  const { main: toolRun, others: otherToolRuns } = pickToolRuns(toolRuns.runs);
  const weakTools = weakToolCategories(toolRun);

  // "Is this good?" for each tile: our target, and one line of context from the data itself.
  const latestJudgedDay = judgedDays[judgedDays.length - 1];
  const targets = {
    search: targetStatus(
      r5,
      TARGETS.search,
      weakest && strongest && weakest !== strongest ? (
        <>
          {queryTypeName(strongest.category)} searches already score {pct(strongest.recall5)};{" "}
          {(QUERY_TYPE_IN_SENTENCE[weakest.category] ?? queryTypeName(weakest.category)).toLowerCase()} are the weakest (
          {pct(weakest.recall5)}). Stretch goal: {TARGETS.search.stretch.toFixed(2)}.
        </>
      ) : (
        <>Stretch goal: {TARGETS.search.stretch.toFixed(2)}.</>
      ),
    ),
    notes: targetStatus(
      latest?.meanScore,
      TARGETS.notes,
      "Mostly older notes, written before this check existed. New notes are only published when every claim is backed.",
    ),
    daily: targetStatus(
      gateTotals.judged > 0 ? gateTotals.approved / gateTotals.judged : null,
      TARGETS.daily,
      latestJudgedDay ? (
        <>
          The latest day ran {pct(latestJudgedDay.approved / latestJudgedDay.judged)}. Every held note still gets a person&apos;s
          review.
        </>
      ) : (
        "Every held note still gets a person's review."
      ),
    ),
    assistants: targetStatus(
      toolRun?.metrics.passRate,
      TARGETS.assistants,
      weakTools.length > 0 ? (
        <>Tested with an open 70B model. Weakest: {weakTools.map((c) => `“${c.name}”`).join(" and ")}.</>
      ) : (
        "Tested with an open 70B model; assistants like Claude bring their own, often stronger, models."
      ),
    ),
  };

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
      <p className="mt-2 max-w-2xl text-lg leading-snug text-text">How we check the AI in Latino Canon, and what we find.</p>

      {/* What the page is and why it's public - before any number. */}
      <div className="mt-4 max-w-3xl space-y-3 text-[0.95rem] leading-relaxed text-text/85">
        <p>
          Latino Canon uses AI in three places: <strong className="text-text">search</strong> that understands half-remembered
          plots and Spanish, the short <strong className="text-text">&ldquo;why it matters&rdquo; note</strong> on each title, and
          a server that lets <strong className="text-text">AI assistants</strong> like Claude and ChatGPT use the canon.
        </p>
        <p>
          AI gets things wrong. It can miss the film you meant, or say something about a film that no source supports - and for
          a canon about who gets represented and how, a confident mistake is worse than none. So instead of asking you to trust
          it, we test it after every change and publish the results here: what works, what doesn&apos;t yet, and what we&apos;re
          fixing next.
        </p>
      </div>

      <ul className="mt-5 grid max-w-3xl gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {HONESTY.map(([term, text]) => (
          <li key={term} className="text-text/80">
            <strong className="text-text">{term}.</strong> {text}
          </li>
        ))}
      </ul>

      {/* The page's four sections: the question each answers, its number, and what that number measures. */}
      <h2 className="mt-9 text-sm font-semibold uppercase tracking-wide text-muted">What we measure</h2>
      <p className="mt-1.5 max-w-3xl text-sm text-muted">
        Each number has a target, so you can tell at a glance whether it&apos;s good. They&apos;re{" "}
        <strong className="text-text">our own targets</strong>: there&apos;s no industry standard for these, because a score
        depends on how hard the test is - finding a film by its exact title is far easier than from a half-remembered plot in
        Spanish.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          tab="search"
          active={tab === "search"}
          label="Search"
          question="Does search find the film you mean?"
          measures={`Recall@5: the share of our ${retrieval?.n ?? ""} test searches whose right answer is in the top 5.`}
          target={targets.search}
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
          label="Notes"
          question="Is each note backed by its sources?"
          measures="Groundedness: the share of a note's claims its sources support. 1.0 means all of them."
          target={targets.notes}
          value={latest?.meanScore != null ? latest.meanScore.toFixed(3) : "—"}
          line={latest ? `${latest.n} notes, judge v${judgeVersion(latest)}` : "No valid run yet"}
        />
        <SummaryTile
          tab="daily"
          active={tab === "daily"}
          label="Daily check"
          question="Are new notes checked before you see them?"
          measures="New notes the AI judge approved. The rest wait for a person to review them."
          target={targets.daily}
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
          label="AI assistants"
          question="Do AI assistants use the canon correctly?"
          measures="Test requests a model handled exactly right, using only our tool descriptions."
          target={targets.assistants}
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
                title="Why notes fail"
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
              <Section title="New notes, checked daily">
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
              <ToolSelection run={toolRun} others={otherToolRuns} />
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
              earlier turn, as in &quot;tell me more about the second one&quot;). Some requests are written to trip a model
              up - a film set in the 1940s is not a 1940s film - and other models are scored on the same requests. A request passes when the model calls the
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
