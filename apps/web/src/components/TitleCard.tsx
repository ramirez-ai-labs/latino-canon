import Image from "next/image";
import Link from "next/link";
import {
  INCLUSION_TYPE_LABELS,
  ledByLabel,
  REPRESENTATION_HANDLING_LABELS,
  THEME_LABELS,
  type TitleCard as TitleCardData,
} from "@latino-canon/core";
import { posterUrl } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

/**
 * The card surfaces the model's output on its face - inclusion-type tag + the grounded
 * blurb teaser - instead of hiding it behind an info icon. That's the whole point of
 * the product.
 */
export function TitleCard({ title, className }: { title: TitleCardData; className?: string }) {
  const years = title.yearEnd && title.yearEnd !== title.yearStart
    ? `${title.yearStart}–${title.yearEnd}`
    : `${title.yearStart}`;

  return (
    <Link
      href={`/title/${title.id}`}
      className={`group block overflow-hidden rounded-xl bg-surface shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover ${className ?? ""}`}
    >
      <div className="relative aspect-2/3 w-full overflow-hidden bg-surface-raised">
        <Image
          src={posterUrl(title.posterKey)}
          alt={`${title.title} poster`}
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[0.95rem] font-semibold text-text">{title.title}</h3>
          {title.yearStart >= 2026 && <Badge variant="solid">✨ New</Badge>}
          {title.oscarWin && (
            <Badge variant="oscar" title={title.oscarWin}>
              🏆
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {years} · {title.director ?? "—"}
        </div>
        {title.blurbTeaser && (
          <p className="mt-2 line-clamp-2 text-[0.82rem] leading-snug text-text/80">{title.blurbTeaser}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {title.representationHandling && (
            <Badge variant="contextual">{REPRESENTATION_HANDLING_LABELS[title.representationHandling]}</Badge>
          )}
          {title.inclusionTypesWithConfidence.map((t) => (
            <Badge key={t.slug} variant="inclusion" title={`${Math.round(t.confidence * 100)}% confidence`}>
              {t.slug === "led_by" ? ledByLabel(title.directorGender) : INCLUSION_TYPE_LABELS[t.slug as keyof typeof INCLUSION_TYPE_LABELS]} {t.confidence < 0.99 && `(${Math.round(t.confidence * 100)}%)`}
            </Badge>
          ))}
          {title.themes.slice(0, 2).map((t) => (
            <Badge key={t}>{THEME_LABELS[t]}</Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}
