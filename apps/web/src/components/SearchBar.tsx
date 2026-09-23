"use client";

import { Search } from "lucide-react";
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
      className="flex items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-1 shadow-[var(--shadow-sm)] transition-all focus-within:border-accent/60 focus-within:shadow-[var(--shadow-glow)]"
    >
      <Search className="size-4 shrink-0 text-muted" aria-hidden />
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Try: Mexican family stories from the 90s"
        aria-label="Search Latino films and series"
        className="w-full bg-transparent py-2.5 text-[0.95rem] text-text placeholder:text-muted focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-bg transition-colors hover:bg-accent/90"
      >
        Search
      </button>
    </form>
  );
}
