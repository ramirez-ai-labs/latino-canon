import { Suspense } from "react";
import { SearchBar } from "@/components/SearchBar";
import { TitleCard } from "@/components/TitleCard";
import { search } from "@/lib/api";

export const metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const res = await search({
    q: sp.q,
    mode: sp.mode ?? "hybrid",
    theme: sp.theme,
    kind: sp.kind,
    decade: sp.decade ? Number(sp.decade) : undefined,
    inclusionType: sp.inclusionType,
    limit: 36,
  });

  return (
    <>
      <Suspense>
        <SearchBar autoFocus />
      </Suspense>

      {res.interpretation && (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          Interpreting as <code>{res.interpretation.cleanedQuery || "(browse)"}</code>
          {Object.entries(res.interpretation.filters).length > 0 && (
            <> · {Object.entries(res.interpretation.filters).map(([k, v]) => `${k}:${v}`).join(" · ")}</>
          )}
          <span style={{ opacity: 0.6 }}> ({res.interpretation.source})</span>
        </p>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        {res.results.length} results · {res.mode} · {res.tookMs}ms
      </p>

      <div className="card-grid">
        {res.results.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </>
  );
}
