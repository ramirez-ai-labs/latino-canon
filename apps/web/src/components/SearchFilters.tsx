"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  INCLUSION_TYPES,
  INCLUSION_TYPE_LABELS,
  THEMES,
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

const DECADES = [1980, 1990, 2000, 2010, 2020];

const selectClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-[0.85rem] text-text transition-colors hover:border-muted focus:outline-none focus:ring-2 focus:ring-accent/50";

/**
 * Exposes the same mode/kind/theme/decade/inclusionType filters the search API has
 * supported all along - previously only reachable by hand-editing the URL.
 */
export function SearchFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/search?${next.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap gap-2.5">
      <select
        aria-label="Search mode"
        value={params.get("mode") ?? "hybrid"}
        onChange={(e) => setParam("mode", e.target.value)}
        className={selectClass}
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
        className={selectClass}
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
        className={selectClass}
      >
        <option value="">Any decade</option>
        {DECADES.map((d) => (
          <option key={d} value={d}>
            {d}s
          </option>
        ))}
      </select>

      <select
        aria-label="Theme"
        value={params.get("theme") ?? ""}
        onChange={(e) => setParam("theme", e.target.value)}
        className={selectClass}
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
        className={selectClass}
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
