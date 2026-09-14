import { Suspense } from "react";
import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { SearchFilters } from "@/components/SearchFilters";
import { TitleCard } from "@/components/TitleCard";
import { search } from "@/lib/api";

export const metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const offset = (page - 1) * PER_PAGE;

  const res = await search({
    q: sp.q,
    mode: sp.mode ?? "hybrid",
    theme: sp.theme,
    kind: sp.kind,
    decade: sp.decade ? Number(sp.decade) : undefined,
    inclusionType: sp.inclusionType,
    limit: PER_PAGE + 1, // fetch one extra to detect if there's a next page
    offset,
  });

  const hasNext = res.results.length > PER_PAGE;
  const results = res.results.slice(0, PER_PAGE);
  const hasPrev = page > 1;
  const isBrowse = !sp.q;

  return (
    <>
      <Suspense>
        <SearchBar autoFocus />
        <SearchFilters />
      </Suspense>

      {res.interpretation && (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          Interpreting as <code>{res.interpretation.cleanedQuery || "(browse)"}</code>
          {Object.entries(res.interpretation.filters).length > 0 && (
            <> · {Object.entries(res.interpretation.filters).map(([k, v]) => `${k}:${v}`).join(" · ")}</>
          )}
          <span style={{ opacity: 0.6 }}> ({res.interpretation.source})</span>
        </p>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        {results.length} results · {res.mode} · {res.tookMs}ms {isBrowse && `· Page ${page}`}
      </p>

      <div className="card-grid">
        {results.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>

      {isBrowse && (
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", alignItems: "center", margin: "2rem 0" }}>
          {hasPrev && (
            <Link
              href={`/search?page=${page - 1}${Object.entries(sp)
                .filter(([k, v]) => k !== "page" && k !== "q" && v != null)
                .map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`)
                .join("")}`}
              style={{ padding: "0.5rem 1rem", background: "var(--surface)", borderRadius: 6 }}
            >
              ← Previous
            </Link>
          )}
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Page {page}</span>
          {hasNext && (
            <Link
              href={`/search?page=${page + 1}${Object.entries(sp)
                .filter(([k, v]) => k !== "page" && k !== "q" && v != null)
                .map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`)
                .join("")}`}
              style={{ padding: "0.5rem 1rem", background: "var(--surface)", borderRadius: 6 }}
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
