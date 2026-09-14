import { Suspense } from "react";
import { TitleCard } from "@/components/TitleCard";
import { SearchFilters } from "@/components/SearchFilters";
import { search } from "@/lib/api";
import Link from "next/link";

export const metadata = { title: "Catalog" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const offset = (page - 1) * PER_PAGE;

  const res = await search({
    limit: PER_PAGE + 1, // fetch one extra to detect if there's a next page
    offset,
    mode: "hybrid",
    theme: sp.theme,
    kind: sp.kind,
    decade: sp.decade ? Number(sp.decade) : undefined,
    inclusionType: sp.inclusionType,
  });

  const hasNext = res.results.length > PER_PAGE;
  const results = res.results.slice(0, PER_PAGE);
  const hasPrev = page > 1;

  return (
    <>
      <h1 style={{ marginBottom: "0.5rem" }}>Full Catalog</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1.5rem" }}>
        All titles in the canon · Page {page}
      </p>

      <Suspense>
        <SearchFilters />
      </Suspense>

      <div className="card-grid">
        {results.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>

      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", alignItems: "center", margin: "2rem 0" }}>
        {hasPrev && (
          <Link href={`/catalog?page=${page - 1}`} style={{ padding: "0.5rem 1rem", background: "var(--surface)", borderRadius: 6 }}>
            ← Previous
          </Link>
        )}
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Page {page}</span>
        {hasNext && (
          <Link href={`/catalog?page=${page + 1}`} style={{ padding: "0.5rem 1rem", background: "var(--surface)", borderRadius: 6 }}>
            Next →
          </Link>
        )}
      </div>
    </>
  );
}
