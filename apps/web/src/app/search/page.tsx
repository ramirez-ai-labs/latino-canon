import { Suspense } from "react";
import Link from "next/link";
import type { TitleCard as TitleCardData, SearchResponse, CurationResponse, RankedTitle } from "@latino-canon/core";
import { SearchBar } from "@/components/SearchBar";
import { SearchFilters } from "@/components/SearchFilters";
import { TitleCard } from "@/components/TitleCard";
import { buttonVariants } from "@/components/ui/button";
import { search, curateSearch } from "@/lib/api";
import { cn } from "@/lib/utils";

export const metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

const DIRECTOR_GENDER_RE = /\b(directed|made|helmed)\b.{0,20}\b(women|female|woman)\b|\bwomen[- ]directed\b|\bfemale directors?\b/i;
const DIRECTOR_GENDER_MALE_RE = /\b(directed|made|helmed)\b.{0,20}\b(men|male|man)\b|\bmen[- ]directed\b|\bmale directors?\b/i;
const LIGHTER_RE = /\b(light(er)?|fun|funny|feel[- ]good|uplifting|comedic|comed(y|ies))\b/i;
const HEAVIER_RE = /\b(heavy|heavier|dark|serious|intense|not too light)\b/i;

function isComplexQuery(q: string): boolean {
  if (!q) return false;
  const hasDirectorGender = DIRECTOR_GENDER_RE.test(q) || DIRECTOR_GENDER_MALE_RE.test(q);
  const hasTone = LIGHTER_RE.test(q) || HEAVIER_RE.test(q);
  return hasDirectorGender || hasTone;
}

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

  if (isAgentSearch && sp.q) {
    try {
      res = await curateSearch({ q: sp.q, limit: PER_PAGE });
      isAgent = true;
    } catch (err) {
      console.warn("Agent search failed, falling back to regular search:", err);
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

      {isAgent && (
        <div className="mb-6 rounded-lg border border-border bg-surface-raised p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-brand text-white">AI Search</span>
            <p className="text-sm font-medium text-text">{(res as CurationResponse).interpretation}</p>
          </div>
          <div className="space-y-1">
            {(res as CurationResponse).reasoning.map((line: string, i: number) => (
              <p key={i} className="text-xs text-muted font-mono">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        {!isAgent && (res as SearchResponse).interpretation && (
          <p>
            Interpreting as <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text">{((res as SearchResponse).interpretation!).cleanedQuery || "(browse)"}</code>
            {Object.entries(((res as SearchResponse).interpretation!).filters).length > 0 && (
              <> · {Object.entries(((res as SearchResponse).interpretation!).filters).map(([k, v]) => `${k}:${v}`).join(" · ")}</>
            )}
            <span className="opacity-60"> ({((res as SearchResponse).interpretation!).source})</span>
          </p>
        )}
        <p>
          {results.length} results {isAgent ? "· AI-curated" : `· ${(res as SearchResponse).mode} · ${(res as SearchResponse).tookMs}ms`} {isBrowse && `· Page ${page}`}
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
      ) : isAgent ? (
        <div className="space-y-4">
          {(results as RankedTitle[]).map((ranked) => (
            <div key={ranked.title.id} className="flex gap-4">
              <div className="flex-shrink-0">
                <TitleCard title={ranked.title} />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted space-y-1">
                  {ranked.matchedCriteria.length > 0 && (
                    <p className="flex flex-wrap gap-1">
                      <span className="font-semibold">Matched:</span>
                      {ranked.matchedCriteria.map((crit: string, i: number) => (
                        <span key={i} className="inline-block px-2 py-0.5 rounded bg-surface text-xs">
                          {crit}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="text-xs text-muted italic">{ranked.reason}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {(results as TitleCardData[]).map((t) => (
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
