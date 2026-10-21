"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  INCLUSION_TYPES,
  INCLUSION_TYPE_LABELS,
  THEMES,
  type BrowseSort,
  type FacetOption,
  parseReleaseRange,
  THEME_LABELS,
  type InclusionType,
  type SearchMode,
  type Theme,
  type TitleKind,
} from "@latino-canon/core";

const MODES: { value: SearchMode; label: string }[] = [
  { value: "hybrid", label: "Hybrid (BM25 + semantic)" },
  { value: "lexical", label: "Lexical (keyword)" },
  { value: "semantic", label: "Semantic (meaning)" },
];

// "added" first: the site's default (DEFAULT_SORT in lib/api.ts, which is server-only).
const SORTS: { value: BrowseSort; label: string }[] = [
  { value: "added", label: "Newest in the canon" },
  { value: "year", label: "Release year" },
  { value: "popular", label: "Popular now" },
  { value: "title", label: "Title A\u2013Z" },
];

const KINDS: { value: TitleKind; label: string }[] = [
  { value: "film", label: "Film" },
  { value: "series", label: "Series" },
  { value: "special", label: "Special" },
];

/**
 * A selected value the options don't include (an old link, or the facets call failed) is
 * still shown, so the select never hides a filter that's narrowing the results.
 */
function withSelected(options: FacetOption[], selected: string | null, labelSuffix = ""): FacetOption[] {
  if (!selected || options.some((o) => o.value === selected)) return options;
  return [{ value: selected, label: `${selected}${labelSuffix}`, count: 0 }, ...options];
}

const selectClass =
  "glass-light rounded-full px-3.5 py-1.5 text-[0.85rem] text-text transition-all duration-200 hover:border-muted focus:outline-none focus:ring-2 focus:ring-accent/60 focus:shadow-[var(--shadow-glow)]";

/**
 * The release-year range a URL selects, as a "from-to" option value: yearFrom/yearTo, or
 * an older link's `decade` (still honored by the api) as its ten years.
 */
function selectedRelease(params: URLSearchParams): string {
  const from = params.get("yearFrom");
  const to = params.get("yearTo");
  if (from || to) return `${from ?? ""}-${to ?? ""}`;
  const decade = Number(params.get("decade"));
  return decade ? `${decade}-${decade + 9}` : "";
}

/**
 * Exposes the same mode/kind/theme/release/inclusionType filters the search API has
 * supported all along - previously only reachable by hand-editing the URL - and, for a
 * browse, the order.
 *
 * Country and release options come from the catalog itself (GET /titles/facets, built into
 * options by packages/core facets.ts): the in-scope production countries (the US, Spain and
 * Latin America, not every co-producer TMDB lists), sorted A-Z by name, and release ranges
 * newest first - a decade, or a single year once a year holds enough titles to deserve one
 * (releaseOptions). Decades alone stopped narrowing much at 460 titles: "2020s" was a third
 * of the catalog.
 */
export function SearchFilters({ countries, released }: { countries: FacetOption[]; released: FacetOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const countryList = withSelected(countries, params.get("country"));
  const release = selectedRelease(params);
  const releaseList = withSelected(released, release);
  const isBrowse = !params.get("q");

  // Any change starts again at page 1 - page 3 of the old filters may not exist under the new ones.
  function push(next: URLSearchParams) {
    next.delete("page");
    router.push(`/search?${next.toString()}`);
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  function setRelease(value: string) {
    const next = new URLSearchParams(params.toString());
    next.delete("decade");
    next.delete("yearFrom");
    next.delete("yearTo");
    const range = parseReleaseRange(value);
    if (range) {
      next.set("yearFrom", String(range.yearFrom));
      next.set("yearTo", String(range.yearTo));
    }
    push(next);
  }

  // A glow ring on any select whose value isn't the "no filter" default - a quick
  // visual scan of which constraints are actually narrowing the current result set.
  const glowClass = "ring-1 ring-accent/60 shadow-[var(--shadow-glow)]";

  return (
    <div className="mb-6 flex flex-wrap gap-2.5">
      {/* A query ranks by relevance - the order only applies to browsing. */}
      {isBrowse && (
        <select
          aria-label="Sort"
          value={params.get("sort") ?? "added"}
          onChange={(e) => setParam("sort", e.target.value === "added" ? "" : e.target.value)}
          className={cn(selectClass, params.get("sort") && params.get("sort") !== "added" && glowClass)}
        >
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Search mode"
        value={params.get("mode") ?? "hybrid"}
        onChange={(e) => setParam("mode", e.target.value)}
        className={cn(selectClass, params.get("mode") && params.get("mode") !== "hybrid" && glowClass)}
      >
        {MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Kind"
        value={params.get("kind") ?? ""}
        onChange={(e) => setParam("kind", e.target.value)}
        className={cn(selectClass, params.get("kind") && glowClass)}
      >
        <option value="">Film or series</option>
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Released"
        value={release}
        onChange={(e) => setRelease(e.target.value)}
        className={cn(selectClass, release && glowClass)}
      >
        <option value="">Any year</option>
        {releaseList.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Country"
        value={params.get("country") ?? ""}
        onChange={(e) => setParam("country", e.target.value)}
        className={cn(selectClass, params.get("country") && glowClass)}
      >
        <option value="">Any country</option>
        {countryList.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Theme"
        value={params.get("theme") ?? ""}
        onChange={(e) => setParam("theme", e.target.value)}
        className={cn(selectClass, params.get("theme") && glowClass)}
      >
        <option value="">Any theme</option>
        {(THEMES as readonly Theme[]).map((t) => (
          <option key={t} value={t}>
            {THEME_LABELS[t]}
          </option>
        ))}
      </select>

      <select
        aria-label="Inclusion type"
        value={params.get("inclusionType") ?? ""}
        onChange={(e) => setParam("inclusionType", e.target.value)}
        className={cn(selectClass, params.get("inclusionType") && glowClass)}
      >
        <option value="">Any inclusion type</option>
        {(INCLUSION_TYPES as readonly InclusionType[]).map((t) => (
          <option key={t} value={t}>
            {INCLUSION_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}
