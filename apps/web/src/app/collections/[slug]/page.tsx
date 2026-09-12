import { notFound } from "next/navigation";
import { TitleCard } from "@/components/TitleCard";
import { getCollection } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getCollection(slug).catch(() => null);
  if (!collection) notFound();

  return (
    <>
      <section style={{ margin: "1rem 0 2rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>{collection.title}</h1>
        <p style={{ color: "var(--muted)" }}>{collection.description}</p>
      </section>

      <div className="card-grid">
        {collection.items.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </>
  );
}
