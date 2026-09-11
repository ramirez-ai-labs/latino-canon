import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "@/components/SearchBar";
import { TitleCard } from "@/components/TitleCard";
import { listCollections, search } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Landing feed = popularity browse (empty query).
  const [featured, collections] = await Promise.all([
    search({ limit: 12 }),
    listCollections().then((r) => r.collections).catch(() => []),
  ]);

  return (
    <>
      <section style={{ textAlign: "center", padding: "2rem 0 0" }}>
        <h1 style={{ fontSize: "1.8rem", margin: 0 }}>The Latino film canon, searchable.</h1>
        <p style={{ color: "var(--muted)" }}>
          Search by plot, theme, era, or filmmaker — in English or Spanish.
        </p>
        <Suspense>
          <SearchBar />
        </Suspense>
      </section>

      <section id="collections" style={{ margin: "2rem 0" }}>
        <h2>Collections</h2>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {collections.map((c) => (
            <Link
              key={c.slug}
              href={`/search?collection=${c.slug}`}
              style={{ padding: "1rem 1.25rem", background: "var(--surface)", borderRadius: 8, minWidth: 180 }}
            >
              <strong>{c.title}</strong>
              <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{c.description}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>Featured</h2>
        <div className="card-grid">
          {featured.results.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      </section>
    </>
  );
}
