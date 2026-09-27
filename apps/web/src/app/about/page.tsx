import Link from "next/link";
import { GROUNDEDNESS_MIN_VALID_JUDGE_VERSION, INCLUSION_TYPE_LABELS, INCLUSION_TYPES } from "@latino-canon/core";
import { listEvalRuns } from "@/lib/api";

export const metadata = { title: "About" };
// The colophon reads live numbers (catalog size, latest evals) from the api.
export const dynamic = "force-dynamic";

const REPO = "https://github.com/ramirez-ai-labs/latino-canon";
const MCP_URL = "https://latino-canon-mcp.ai-builders-studio-latinx.workers.dev/mcp";

/** The release this build is, from the root package.json via next.config (RELEASE_VERSION). */
const version = process.env.RELEASE_VERSION;

async function colophonNumbers() {
  const [retrieval, groundedness] = await Promise.all([
    listEvalRuns(1, "retrieval").catch(() => ({ runs: [] })),
    listEvalRuns(10, "groundedness").catch(() => ({ runs: [] })),
  ]);
  const search = retrieval.runs[0];
  const blurbs = groundedness.runs.find((r) => (r.metrics.judgeVersion ?? 1) >= GROUNDEDNESS_MIN_VALID_JUDGE_VERSION);
  // The latest retrieval run records the catalog it ran against - a live count without
  // another api call on every About view.
  const catalogSize = (search?.details as { catalogSize?: number } | null)?.catalogSize;
  return {
    recall5: search?.metrics["hybrid.recall@5"] ?? search?.meanScore ?? null,
    queries: search?.n,
    groundedness: blurbs?.meanScore ?? null,
    catalogSize,
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-4 border-t border-border py-2.5 first:border-t-0">
      <dt className="pt-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="text-[0.9rem] text-text">{children}</dd>
    </div>
  );
}

const linkClass = "text-accent underline-offset-2 hover:underline";

export default async function AboutPage() {
  const n = await colophonNumbers();
  // Mid-sentence case, but "Latino" is a proper noun: "Latino-directed, … about the community".
  const types = INCLUSION_TYPES.map((t) => INCLUSION_TYPE_LABELS[t]).map((l) =>
    l.startsWith("Latin") ? l : l.charAt(0).toLowerCase() + l.slice(1),
  );

  return (
    <article className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">About Latino Canon</h1>
      <p className="text-[0.95rem] leading-relaxed text-text/90">
        Latino Canon indexes Latino-led films and series and makes them searchable by plot, theme, era, or
        filmmaker — in English or Spanish.
      </p>
      <div>
        <h2 className="mb-2 text-xl font-semibold">How a title qualifies</h2>
        <p className="text-[0.95rem] leading-relaxed text-text/90">
          Every title carries at least one <em>inclusion type</em>: {types.slice(0, -1).join(", ")}, or {types[types.length - 1]}. Curated titles carry an editor&apos;s tags; a classifier proposes
          them for the rest, and low-confidence calls go to an editor. The tag and where it came from are shown on
          every title.
        </p>
      </div>
      <div>
        <h2 className="mb-2 text-xl font-semibold">AI, disclosed</h2>
        <p className="text-[0.95rem] leading-relaxed text-text/90">
          &ldquo;Why it matters&rdquo; notes are model-written from cited sources and appear only once approved: by an
          editor, or by an AI judge that checks every claim against those sources and approves only a note it finds
          fully supported. Search combines keyword (BM25) and semantic (embedding) retrieval. The{" "}
          <Link href="/eval" className={linkClass}>
            Evals
          </Link>{" "}
          page shows how well both are working.
        </p>
      </div>

      {/* Colophon: the edition line of a printed program - what you're looking at, and how current it is. */}
      <footer className="border-t-[1.5px] border-ink-rule pt-4">
        <dl>
          {version && (
            <Row label="Edition">
              v{version} ·{" "}
              <a href={`${REPO}/releases/tag/latino-canon-v${version}`} className={linkClass}>
                Release notes
              </a>
            </Row>
          )}
          {n.catalogSize != null && <Row label="Catalog">{n.catalogSize} titles live</Row>}
          {(n.recall5 != null || n.groundedness != null) && (
            <Row label="Evals">
              {n.recall5 != null && (
                <>
                  Search recall@5 {n.recall5.toFixed(3)}
                  {n.queries ? ` on ${n.queries} queries` : ""}
                </>
              )}
              {n.recall5 != null && n.groundedness != null && " · "}
              {n.groundedness != null && <>Blurb groundedness {n.groundedness.toFixed(3)}</>} ·{" "}
              <Link href="/eval" className={linkClass}>
                Evals
              </Link>
            </Row>
          )}
          <Row label="For AI">
            Connect Claude, ChatGPT or Cursor over MCP:{" "}
            <code className="break-all rounded bg-surface px-1.5 py-0.5 text-[0.8rem]">{MCP_URL}</code> ·{" "}
            <a href={`${REPO}/blob/main/docs/MCP.md`} className={linkClass}>
              How
            </a>
          </Row>
          <Row label="Source">
            <a href={REPO} className={linkClass}>
              github.com/ramirez-ai-labs/latino-canon
            </a>
          </Row>
        </dl>
      </footer>
    </article>
  );
}
