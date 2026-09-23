import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "@/components/SearchBar";
import { TitleCard } from "@/components/TitleCard";
import { Rail, RailItem } from "@/components/ui/Rail";
import { getCollection, listCollections, listRecentTitles } from "@/lib/api";
import { MODEL_TAG_DISPLAY_THRESHOLD } from "@latino-canon/core";
import type { TitleCard as TitleCardType } from "@latino-canon/core";

export const dynamic = "force-dynamic";


/* eslint-disable @typescript-eslint/no-explicit-any */
function titleToCard(title: any): TitleCardType {
  const directorGender = title.credits.find((c: any) => c.role === "director")?.person.gender ?? null;
  const inclusionTypesWithConfidence = title.tags
    .filter((t: any) => t.kind === "inclusion_type" && t.confidence >= MODEL_TAG_DISPLAY_THRESHOLD)
    .map((t: any) => ({ slug: t.slug, confidence: t.confidence }));

  return {
    id: title.id,
    kind: title.kind,
    title: title.title,
    yearStart: title.yearStart,
    yearEnd: title.yearEnd,
    director: title.credits.find((c: any) => c.role === "director")?.person.name ?? null,
    directorGender,
    leadActor: title.credits.find((c: any) => c.role === "cast")?.person.name ?? null,
    leadActorGender: title.credits.find((c: any) => c.role === "cast")?.person.gender ?? null,
    posterKey: title.posterKey,
    blurbTeaser: title.blurb?.text ? title.blurb.text.substring(0, 140) + (title.blurb.text.length > 140 ? "…" : "") : null,
    inclusionTypes: inclusionTypesWithConfidence.map((t: any) => t.slug),
    inclusionTypesWithConfidence,
    themes: title.tags
      .filter((t: any) => t.kind === "theme")
      .map((t: any) => t.slug),
    score: 0,
    representationHandling: title.representationHandling,
    runtime: title.runtime,
    oscarWin: title.oscarWin,
  };
}

export default async function HomePage() {
  const { collections } = await listCollections().catch(() => ({ collections: [] }));
  const rails = await Promise.all(
    collections.map((c) => getCollection(c.slug).catch(() => null)),
  );
  const recentTitles = await listRecentTitles(5).catch(() => []);
  const recentCards = recentTitles.map(titleToCard);

  return (
    <div className="flex flex-col gap-20">
      {/* Hero Section with Gradient Mesh */}
      <section className="relative overflow-hidden rounded-3xl px-6 py-24 text-center sm:px-12 sm:py-32">
        <div aria-hidden className="gradient-mesh absolute inset-0 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(circle at 20% 80%, rgba(102, 126, 234, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(240, 147, 251, 0.15) 0%, transparent 50%)'
        }} />

        <div className="relative mx-auto max-w-3xl">
          <h1 className="text-balance text-5xl sm:text-6xl font-800 tracking-tight leading-tight">
            The Latino film canon,
            <br />
            <span className="bg-gradient-to-r from-[#667eea] via-[#f093fb] to-[#4facfe] bg-clip-text text-transparent">
              searchable.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted leading-relaxed">
            A curated, credit-verified index of Latino-directed, Latino-created, and Latino-centered film and TV searchable by plot, theme, era, or filmmaker in English or Spanish.
          </p>

          <p className="mx-auto mt-3 max-w-2xl text-balance text-sm text-muted">
            Try: Mexican family stories from the 90s
          </p>

          <div className="mt-10">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Why We're Different Section */}
      <section className="relative overflow-hidden rounded-3xl glass-heavy px-6 py-12 sm:px-12 sm:py-16">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(240, 147, 251, 0.05) 100%)'
        }} />

        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-4xl font-bold text-text">Why we are different.</h2>

          <p className="mt-6 text-lg text-muted leading-relaxed">
            Unlike Netflix and Spotify, we show you the reasoning. Every tag (director, theme, inclusion type) displays its confidence score and source: seed data, model prediction, or editor judgment. Never hidden. Never guessed.
          </p>

          <p className="mt-6 text-lg text-muted leading-relaxed">
            For representation, this matters. When a film is tagged "led by Latina director," you see 99% confidence plus "editor verified." That transparency builds trust in a curated collection.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <h3 className="font-semibold text-text flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-xs font-bold">1</span>
                Search however you remember it
              </h3>
              <p className="text-sm text-muted">Plot, theme, era, filmmaker, in English or Spanish</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-text flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-[#f093fb] to-[#f5576c] text-white text-xs font-bold">2</span>
                Browse curated collections
              </h3>
              <p className="text-sm text-muted">Core Canon, Border Stories, Directors, Breakthrough Firsts</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-text flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-[#4facfe] to-[#00f2fe] text-white text-xs font-bold">3</span>
                Explore with confidence
              </h3>
              <p className="text-sm text-muted">Every tag traces to a real credit or editor judgment call</p>
            </div>
          </div>
        </div>
      </section>

      {recentCards.length > 0 && (
        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold text-text">Recently Added</h2>
              <p className="text-sm text-muted mt-2">Latest titles added to the canon</p>
            </div>
          </div>
          <Rail>
            {recentCards.map((t, i) => (
              <RailItem
                key={t.id}
                className="w-[42vw] sm:w-[220px]"
                style={{
                  animation: `slide-in-up 0.6s ease-out ${i * 50}ms both`,
                }}
              >
                <TitleCard title={t} />
              </RailItem>
            ))}
          </Rail>
        </section>
      )}

      {/* AI Disclosure Section */}
      <section className="relative overflow-hidden rounded-3xl glass-heavy px-6 py-12 sm:px-12 sm:py-16">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(240, 147, 251, 0.05) 100%)'
        }} />

        <div className="relative">
          <h2 className="text-3xl font-bold text-text">Why "AI, disclosed" matters</h2>

          <div className="mt-8 grid gap-6 text-base text-muted">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-xs font-bold mt-0.5">
                1
              </div>
              <div>
                <p className="font-semibold text-text">Netflix & Spotify hide their algorithms</p>
                <p className="text-sm mt-1">You see results, but not why. The ML lives in a black box.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-[#f093fb] to-[#f5576c] flex items-center justify-center text-white text-xs font-bold mt-0.5">
                2
              </div>
              <div>
                <p className="font-semibold text-text">Latino Canon discloses them</p>
                <p className="text-sm mt-1">Every tag shows its confidence score and source (seed data, model prediction, or editor judgment). Click any title to see the full reasoning.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-[#4facfe] to-[#00f2fe] flex items-center justify-center text-white text-xs font-bold mt-0.5">
                3
              </div>
              <div>
                <p className="font-semibold text-text">Why this matters for Latino cinema</p>
                <p className="text-sm mt-1">Representation isn't generic. When a film is tagged "led by Latina director," you see 99% confidence + "editor verified" (not guessed by ML). Transparency builds trust.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {rails
        .filter((c) => c && c.items.length > 0)
        .map((c) => (
          <section key={c!.slug} id={c!.slug === "core-canon" ? "collections" : undefined}>
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-bold text-text">{c!.title}</h2>
                <p className="text-sm text-muted mt-2">{c!.description}</p>
              </div>
              <Link
                href={`/collections/${c!.slug}`}
                className="shrink-0 text-sm text-muted transition-colors hover:text-accent font-medium"
              >
                See all →
              </Link>
            </div>
            <Rail>
              {c!.items.map((t, itemIdx) => (
                <RailItem
                  key={t.id}
                  className="w-[42vw] sm:w-[220px]"
                  style={{
                    animation: `slide-in-up 0.6s ease-out ${itemIdx * 50}ms both`,
                  }}
                >
                  <TitleCard title={t} />
                </RailItem>
              ))}
            </Rail>
          </section>
        ))}

      {/* CTA Section */}
      <div className="flex flex-col items-center gap-8 py-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-text">Ready to explore?</h2>
          <p className="text-muted mt-2">Discover Latino cinema by plot, theme, era, or filmmaker</p>
        </div>
        <Link
          href="/catalog"
          className="inline-flex items-center justify-center px-8 py-4 rounded-full font-semibold text-white transition-all duration-300 hover-lift"
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            boxShadow: '0 0 30px rgba(102, 126, 234, 0.4)'
          }}
        >
          Browse the full catalog
        </Link>
      </div>
    </div>
  );
}
