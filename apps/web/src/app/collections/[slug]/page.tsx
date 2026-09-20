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
        <h1 className="mb-1 text-2xl font-bold tracking-tight">{collection.title}</h1>
        <p className="text-muted">{collection.description}</p>
      </section>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {collection.items.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </>
  );
}
