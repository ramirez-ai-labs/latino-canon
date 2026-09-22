import { Suspense } from "react";
import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { SearchFilters } from "@/components/SearchFilters";
import { TitleCard } from "@/components/TitleCard";
import { buttonVariants } from "@/components/ui/button";
import { search } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  const isBrowse = !sp.q;

  const res = await search({
    q: sp.q,
    mode: sp.mode ?? "hybrid",
    theme: sp.theme,
    kind: sp.kind,
    country: sp.country,
    decade: sp.decade ? Number(sp.decade) : undefined,
    inclusionType: sp.inclusionType,
    limit: PER_PAGE + 1,
    offset: isBrowse ? offset : undefined,
  });

  const hasNext = res.results.length > PER_PAGE;
  const results = res.results.slice(0, PER_PAGE);
  const hasPrev = page > 1;

  const pageHref = (p: number) =>
    `/search?page=${p}${Object.entries(sp)
      .filter(([k, v]) => k !== "page" && k !== "q" && v != null)
      .map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`)
      .join("")}`;

  return (
    <>
      <Suspense>
        <SearchBar autoFocus />
        <div className="mt-6">
          <SearchFilters />
        </div>
      </Suspense>

      <div className="mb-5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        {res.interpretation && (
          <p>
            Interpreting as <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text">{res.interpretation.cleanedQuery || "(browse)"}</code>
            {Object.entries(res.interpretation.filters).length > 0 && (
              <> · {Object.entries(res.interpretation.filters).map(([k, v]) => `${k}:${v}`).join(" · ")}</>
            )}
            <span className="opacity-60"> ({res.interpretation.source})</span>
          </p>
        )}
        <p>
          {results.length} results · {res.mode} · {res.tookMs}ms {isBrowse && `· Page ${page}`}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-border bg-surface-raised py-12 px-6 text-center">
          <p className="text-lg font-semibold text-text">No titles match these filters</p>
          <p className="mt-2 text-sm text-muted max-w-md">
            Try adjusting your search or removing filters like decade, country, or theme to see more results.
          </p>
          <div className="mt-6 flex flex-col gap-2 text-sm">
            {sp.q && (
              <p className="text-muted">
                Searching for: <code className="rounded bg-surface px-2 py-1 text-text">{sp.q}</code>
              </p>
            )}
            {Object.entries(sp).filter(([k, v]) => k !== "q" && v != null && k !== "page" && k !== "mode").length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                {Object.entries(sp)
                  .filter(([k, v]) => k !== "q" && v != null && k !== "page" && k !== "mode")
                  .map(([k, v]) => (
                    <span key={k} className="rounded bg-surface px-2 py-1 text-muted text-xs">
                      {k}: {v}
                    </span>
                  ))}
              </div>
            )}
            <Link href="/search" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-4 w-fit mx-auto")}>
              Clear filters & browse
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      )}

      {isBrowse && (
        <div className="my-10 flex items-center justify-center gap-4">
          {hasPrev && (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "secondary" })}>
              ← Previous
            </Link>
          )}
          <span className={cn("text-sm text-muted", !hasPrev && !hasNext && "hidden")}>Page {page}</span>
          {hasNext && (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "secondary" })}>
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
