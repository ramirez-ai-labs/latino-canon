import { Suspense } from "react";
import Link from "next/link";
import type { TitleCard as TitleCardData, SearchResponse, CurationResponse, RankedTitle } from "@latino-canon/core";
import { isComplexQuery } from "@latino-canon/core";
import { SearchBar } from "@/components/SearchBar";
import { SearchFilters } from "@/components/SearchFilters";
import { TitleCard } from "@/components/TitleCard";
import { AgentSearchReasoning } from "@/components/AgentSearchReasoning";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, search, curateSearch } from "@/lib/api";
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
  const isAgentSearch = sp.q && isComplexQuery(sp.q);

  let res: SearchResponse | CurationResponse;
  let isAgent = false;
  let rateLimited = false;

  // The api limits uncached queries per visitor (30/min). Over it, say so here -
  // app/error.tsx can't: Next strips thrown messages from server errors in production.
  try {
    if (isAgentSearch && sp.q) {
      try {
        res = await curateSearch({ q: sp.q, limit: PER_PAGE });
        isAgent = true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Agent] Failed for query "${sp.q}": ${errMsg}`);
        console.error(`[Agent] Full error:`, err);
        res = await search({
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
      }
    } else {
      res = await search({
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
    }
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 429)) throw err;
    rateLimited = true;
    res = { query: sp.q ?? "", mode: "hybrid", interpretation: null, results: [], tookMs: 0 };
  }

  const resultsArray = isAgent
    ? (res as CurationResponse).topResults
    : (res as SearchResponse).results;
  const hasNext = resultsArray.length >= PER_PAGE;
  const results = resultsArray.slice(0, PER_PAGE);
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

      {isAgent && <AgentSearchReasoning response={res as CurationResponse} />}

      <div className="mb-5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        {!isAgent && (res as SearchResponse).interpretation && (
          <p>
            Interpreting as <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text">{((res as SearchResponse).interpretation!).cleanedQuery || "(browse)"}</code>
            {Object.entries(((res as SearchResponse).interpretation!).filters).length > 0 && (
              <> · {((res as SearchResponse).interpretation!).filterMode === "boost" ? "favoring " : ""}{Object.entries(((res as SearchResponse).interpretation!).filters).map(([k, v]) => `${k}:${v}`).join(" · ")}</>
            )}
            <span className="opacity-60"> ({((res as SearchResponse).interpretation!).source})</span>
          </p>
        )}
        {!isAgent && (res as SearchResponse).degraded && (
          <p>Meaning-based search is temporarily unavailable - showing keyword matches only.</p>
        )}
        <p>
          {results.length} results {isAgent ? "· AI-curated" : `· ${(res as SearchResponse).mode} · ${(res as SearchResponse).tookMs}ms`} {isBrowse && `· Page ${page}`}
        </p>
      </div>

      {rateLimited ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-border bg-surface-raised py-12 px-6 text-center">
          <p className="text-lg font-semibold text-text">That&apos;s a lot of searches in a minute</p>
          <p className="mt-2 text-sm text-muted max-w-md">
            Each new search runs AI models on a shared daily budget, so they&apos;re limited per visitor. Try
            again in a minute - repeated searches and browsing aren&apos;t limited.
          </p>
        </div>
      ) : results.length === 0 ? (
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
      ) : isAgent ? (
        <div className="space-y-4">
          {(results as RankedTitle[]).map((ranked, idx) => (
            <div
              key={ranked.title.id}
              className="glass-light rounded-2xl p-4 flex gap-4 hover-lift transition-all duration-300 border border-border/50 hover:border-border"
              style={{
                background: "linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(240, 147, 251, 0.05) 100%)",
                animation: `slide-in-up 0.6s ease-out ${idx * 100}ms both`,
              }}
            >
              <div className="flex-shrink-0" style={{ width: "150px" }}>
                <TitleCard title={ranked.title} />
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <h3 className="font-semibold text-text text-sm">{ranked.title.title}</h3>
                <p className="text-xs text-muted mt-1">Directed by {ranked.title.director}</p>
                <p className="text-sm text-muted mt-3 leading-relaxed">{ranked.reason}</p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 bg-surface-raised rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#667eea] to-[#f093fb]"
                      style={{ width: `${Math.round(ranked.score * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-accent">{Math.round(ranked.score * 100)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {(results as TitleCardData[]).map((t, idx) => (
            <div
              key={t.id}
              className="group cursor-pointer"
              style={{
                animation: `slide-in-up 0.6s ease-out ${idx * 50}ms both`,
              }}
            >
              <div className="relative rounded-xl overflow-hidden transition-all duration-300 hover-lift">
                <div className="absolute inset-0 glass opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 rounded-xl" />
                <TitleCard title={t} />
              </div>
            </div>
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
