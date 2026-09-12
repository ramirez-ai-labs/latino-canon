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
];

const DECADES = [1980, 1990, 2000, 2010, 2020];

const selectStyle: React.CSSProperties = {
  padding: "0.5rem 0.7rem",
  borderRadius: 8,
  border: "1px solid #33333a",
  background: "#1c1c20",
  color: "inherit",
  fontSize: "0.85rem",
};

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
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.6rem",
        margin: "0 0 1.5rem",
      }}
    >
      <select
        aria-label="Search mode"
        value={params.get("mode") ?? "hybrid"}
        onChange={(e) => setParam("mode", e.target.value)}
        style={selectStyle}
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
        style={selectStyle}
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
        style={selectStyle}
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
        style={selectStyle}
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
        style={selectStyle}
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
