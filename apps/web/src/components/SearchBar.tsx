"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Preserve any filters already in the URL (SearchFilters) instead of
        // replacing the whole query string.
        const next = new URLSearchParams(params.toString());
        if (q) next.set("q", q);
        else next.delete("q");
        router.push(`/search?${next.toString()}`);
      }}
      style={{ display: "flex", gap: "0.5rem", margin: "2rem 0" }}
    >
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Try: Mexican family stories from the 90s"
        aria-label="Search Latino films and series"
        style={{
          flex: 1,
          padding: "0.85rem 1.1rem",
          borderRadius: 999,
          border: "1px solid #33333a",
          background: "#1c1c20",
          color: "inherit",
          fontSize: "1rem",
        }}
      />
      <button type="submit" style={{ padding: "0 1.4rem", borderRadius: 999, border: 0, background: "var(--accent)", fontWeight: 600 }}>
        Search
      </button>
    </form>
  );
}
