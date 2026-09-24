import Image from "next/image";
import { notFound } from "next/navigation";
import type { Theme } from "@latino-canon/core";
import {
  CONTEXT_NOTE_CATEGORY_LABELS,
  INCLUSION_TYPE_LABELS,
  ledByLabel,
  primaryCreativeLead,
  REPRESENTATION_HANDLING_DEFINITIONS,
  REPRESENTATION_HANDLING_LABELS,
  splitCitations,
  THEME_LABELS,
} from "@latino-canon/core";
import { getTitle, posterUrl, search } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { TitleCard } from "@/components/TitleCard";
import { Rail, RailItem } from "@/components/ui/Rail";

export const dynamic = "force-dynamic";

export default async function TitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = await getTitle(id).catch(() => null);
  if (!title) notFound();

  // Director if credited, else the first-ordered creator - same fallback db/cards.ts's
  // hydrateCards uses for TitleCard.directorGender - drives led_by's gendered label.
  const directorGender = primaryCreativeLead(title.credits)?.person.gender ?? null;

  // "Related" reuses the same theme filter /catalog already exposes rather than a new
  // similarity endpoint - a shared theme is the one signal every title already carries.
  const primaryTheme = title.tags.find((t) => t.kind === "theme")?.slug as Theme | undefined;
  const related = primaryTheme
    ? (await search({ theme: primaryTheme, mode: "lexical", limit: 9 }).catch(() => ({ results: [] })))
        .results.filter((t) => t.id !== title.id)
        .slice(0, 8)
    : [];

  return (
    <article className="relative">
      <div
        aria-hidden
        className="gradient-mesh pointer-events-none absolute -inset-x-6 -top-6 h-[420px] rounded-3xl opacity-60 blur-2xl"
      />
      <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-[240px_1fr]">
        <div className="group relative aspect-2/3 w-full overflow-hidden rounded-2xl bg-surface-raised shadow-[var(--shadow-xl)] animate-slide-in-up">
          <Image src={posterUrl(title.posterKey)} alt="" fill sizes="240px" className="object-cover" priority />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent" />
        </div>
        <div className="glass-heavy animate-slide-in-up rounded-2xl p-6" style={{ animationDelay: "80ms" }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title.title}</h1>
          {title.yearStart >= 2026 && <Badge variant="solid">✨ New to Canon</Badge>}
          {title.oscarWin && <Badge variant="oscar" title={title.oscarWin}>🏆 {title.oscarWin}</Badge>}
        </div>
        <p className="mt-1 text-muted">
          {title.yearStart}
          {title.yearEnd ? `–${title.yearEnd}` : ""} · {title.kind} · {title.country.join(", ")}
        </p>

        {title.representationHandling && (
          <p className="mt-3 rounded-lg border-l-[3px] border-gold bg-gold/10 px-3 py-2 text-sm">
            {REPRESENTATION_HANDLING_LABELS[title.representationHandling]} —{" "}
            {REPRESENTATION_HANDLING_DEFINITIONS[title.representationHandling]}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {title.tags
            .filter((t) => t.kind === "inclusion_type")
            .map((t) => (
              <Badge key={t.slug} variant="inclusion" title={`${Math.round(t.confidence * 100)}% · ${t.source}`}>
                {t.slug === "led_by"
                  ? ledByLabel(directorGender)
                  : (INCLUSION_TYPE_LABELS[t.slug as keyof typeof INCLUSION_TYPE_LABELS] ?? t.label)}
              </Badge>
            ))}
          {title.tags
            .filter((t) => t.kind === "theme")
            .map((t) => (
              <Badge key={t.slug} variant="theme">{THEME_LABELS[t.slug as keyof typeof THEME_LABELS] ?? t.label}</Badge>
            ))}
        </div>

        {(title.credits.length > 0 || Boolean(title.runtime)) && (
          <section className="mt-6 space-y-1.5 text-[0.9rem]">
            {title.credits.filter((c) => c.role === "creator" || c.role === "director").length > 0 && (
              <p>
                <strong>{title.credits.some((c) => c.role === "creator") ? "Created by" : "Directed by"}:</strong>{" "}
                {title.credits
                  .filter((c) => c.role === "creator" || c.role === "director")
                  .map((c) => c.person.name)
                  .join(", ")}
              </p>
            )}
            {title.credits.filter((c) => c.role === "cast").length > 0 && (
              <p>
                <strong>Starring:</strong>{" "}
                {title.credits
                  .filter((c) => c.role === "cast")
                  .slice(0, 6)
                  .map((c) => c.person.name)
                  .join(", ")}
              </p>
            )}
            {title.runtime ? (
              <p>
                <strong>Runtime:</strong> {title.runtime} min
              </p>
            ) : null}
          </section>
        )}

        {title.blurb && (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              Why it matters
              <Badge title={`Generated by ${title.blurb.model}, editor-approved`}>AI-assisted</Badge>
            </h2>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-text/90">
              {/* Inline [s1]/[d0] citations become numbered footnotes; a marker with no
                  matching source is dropped rather than shown raw. */}
              {splitCitations(title.blurb.text).map((part, i) => {
                if ("text" in part) return <span key={i}>{part.text}</span>;
                const n = title.blurb!.sources.findIndex((s) => s.id === part.cite);
                return n < 0 ? null : (
                  <sup key={i}>
                    <a href={`#source-${part.cite}`} className="text-accent hover:underline">
                      {n + 1}
                    </a>
                  </sup>
                );
              })}
            </p>
            {title.blurb.sources.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-muted transition-colors hover:text-text">Sources</summary>
                <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-muted">
                  {title.blurb.sources.map((s, i) => (
                    <li key={i} id={s.id ? `source-${s.id}` : undefined}>
                      <strong className="text-text/80">{s.kind}</strong> — {s.text ?? s.quote ?? s.ref}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>
        )}

        {title.synopsis && (
          <section className="mt-6">
            <h2 className="text-base font-semibold">Synopsis</h2>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-text/90">{title.synopsis}</p>
          </section>
        )}

        {title.contextNotes.length > 0 && (
          <section className="mt-6">
            <h2 className="text-base font-semibold">Representation notes</h2>
            {title.contextNotes.map((note, i) => (
              <div key={i} className="mt-3">
                <Badge title={note.status === "review_required" ? "Still under editorial review" : "Confirmed"}>
                  {CONTEXT_NOTE_CATEGORY_LABELS[note.category]}
                </Badge>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-text/90">{note.summary}</p>
                {note.sources.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-sm text-muted transition-colors hover:text-text">Sources</summary>
                    <ul className="mt-1.5 space-y-1 text-sm text-muted">
                      {note.sources.map((s, j) => (
                        <li key={j}>
                          <strong className="text-text/80">{s.kind}</strong> — {s.quote ?? s.ref}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </section>
        )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Related titles</h2>
          <Rail>
            {related.map((t, i) => (
              <RailItem
                key={t.id}
                className="w-[42vw] sm:w-[200px]"
                style={{ animation: `slide-in-up 0.5s ease-out ${i * 60}ms both` }}
              >
                <TitleCard title={t} />
              </RailItem>
            ))}
          </Rail>
        </section>
      )}
    </article>
  );
}
