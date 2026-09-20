import Link from "next/link";
import { Languages, ShieldCheck, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { SearchBar } from "@/components/SearchBar";
import { TitleCard } from "@/components/TitleCard";
import { Rail, RailItem } from "@/components/ui/Rail";
import { buttonVariants } from "@/components/ui/button";
import { getCollection, listCollections } from "@/lib/api";

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Verified, not guessed",
    body: "Every tag traces to a real director, writer, or cast credit — or an editor's call when the model isn't confident enough to show on its own.",
  },
  {
    icon: Languages,
    title: "Search however you remember it",
    body: "Plot, theme, era, or filmmaker — in English or Spanish. Half-remembered is fine.",
  },
  {
    icon: Sparkles,
    title: "AI, disclosed",
    body: "“Why it matters” notes are model-generated and editor-approved before they appear — never hidden behind an info icon.",
  },
];

export default async function HomePage() {
  const { collections } = await listCollections().catch(() => ({ collections: [] }));
  const rails = await Promise.all(
    collections.map((c) => getCollection(c.slug).catch(() => null)),
  );

  return (
    <div className="flex flex-col gap-14">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-surface to-bg px-6 py-16 text-center sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--color-accent-muted),_transparent_60%)]"
        />
        <div className="relative mx-auto max-w-2xl">
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            The Latino film canon, <span className="text-accent">searchable.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-balance text-muted">
            A curated, credit-verified index of Latino-directed, Latino-created, and
            Latino-centered film and TV — searchable by plot, theme, era, or filmmaker,
            in English or Spanish.
          </p>
          <div className="mt-6">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="flex gap-3">
            <p.icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          </div>
        ))}
      </section>

      {rails
        .filter((c) => c && c.items.length > 0)
        .map((c) => (
          <section key={c!.slug} id={c!.slug === "core-canon" ? "collections" : undefined}>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold">{c!.title}</h2>
                <p className="text-sm text-muted">{c!.description}</p>
              </div>
              <Link href={`/collections/${c!.slug}`} className="shrink-0 text-sm text-muted transition-colors hover:text-accent">
                See all →
              </Link>
            </div>
            <Rail>
              {c!.items.map((t) => (
                <RailItem key={t.id} className="w-[42vw] sm:w-[220px]">
                  <TitleCard title={t} />
                </RailItem>
              ))}
            </Rail>
          </section>
        ))}

      <div className="text-center">
        <Link href="/catalog" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Browse the full catalog
        </Link>
      </div>
    </div>
  );
}
