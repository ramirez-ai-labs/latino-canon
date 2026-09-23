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
      <section className="mb-8">
        <h1 className="mb-1 text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-r from-primary via-accent to-accent-cyan bg-clip-text text-transparent">
            {collection.title}
          </span>
        </h1>
        <p className="text-muted">{collection.description}</p>
      </section>

      <div className="columns-2 gap-5 sm:columns-3 md:columns-4 lg:columns-5">
        {collection.items.map((t, i) => (
          <div key={t.id} className="mb-5 break-inside-avoid" style={{ animation: `slide-in-up 0.5s ease-out ${i * 40}ms both` }}>
            <TitleCard title={t} />
          </div>
        ))}
      </div>
    </>
  );
}
