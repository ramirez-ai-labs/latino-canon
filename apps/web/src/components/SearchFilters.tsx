"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  INCLUSION_TYPES,
  INCLUSION_TYPE_LABELS,
  THEMES,
  type FacetOption,
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
 * Exposes the same mode/kind/theme/decade/inclusionType filters the search API has
 * supported all along - previously only reachable by hand-editing the URL.
 *
 * Country and decade options come from the catalog itself (GET /titles/facets, built into
 * options by packages/core facets.ts): production country, sorted A-Z by name, and every
 * decade that has a canon title. They used to be hard-coded and fell behind the catalog.
 */
export function SearchFilters({ countries, decades }: { countries: FacetOption[]; decades: FacetOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const countryList = withSelected(countries, params.get("country"));
  const decadeList = withSelected(decades, params.get("decade"), "s");

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/search?${next.toString()}`);
  }

  // A glow ring on any select whose value isn't the "no filter" default - a quick
  // visual scan of which constraints are actually narrowing the current result set.
  const glowClass = "ring-1 ring-accent/60 shadow-[var(--shadow-glow)]";

  return (
    <div className="mb-6 flex flex-wrap gap-2.5">
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
        aria-label="Decade"
        value={params.get("decade") ?? ""}
        onChange={(e) => setParam("decade", e.target.value)}
        className={cn(selectClass, params.get("decade") && glowClass)}
      >
        <option value="">Any decade</option>
        {decadeList.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
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
