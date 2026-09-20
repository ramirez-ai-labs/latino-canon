import { Suspense } from "react";
import { TitleCard } from "@/components/TitleCard";
import { SearchFilters } from "@/components/SearchFilters";
import { buttonVariants } from "@/components/ui/button";
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
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Full Catalog</h1>
      <p className="mb-6 text-sm text-muted">All titles in the canon · Page {page}</p>

      <Suspense>
        <SearchFilters />
      </Suspense>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {results.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>

      <div className="my-10 flex items-center justify-center gap-4">
        {hasPrev && (
          <Link href={`/catalog?page=${page - 1}`} className={buttonVariants({ variant: "secondary" })}>
            ← Previous
          </Link>
        )}
        <span className="text-sm text-muted">Page {page}</span>
        {hasNext && (
          <Link href={`/catalog?page=${page + 1}`} className={buttonVariants({ variant: "secondary" })}>
            Next →
          </Link>
        )}
      </div>
    </>
  );
}
