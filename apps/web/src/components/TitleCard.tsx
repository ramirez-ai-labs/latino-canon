import Link from "next/link";
import {
  INCLUSION_TYPE_LABELS,
  ledByLabel,
  REPRESENTATION_HANDLING_LABELS,
  THEME_LABELS,
  type TitleCard as TitleCardData,
} from "@latino-canon/core";
import { posterUrl } from "@/lib/api";

/**
 * The card surfaces the model's output on its face — inclusion-type tag + the grounded
 * blurb teaser — instead of hiding it behind an info icon. That's the whole point of
 * the product.
 */
export function TitleCard({ title }: { title: TitleCardData }) {
  const years = title.yearEnd && title.yearEnd !== title.yearStart
    ? `${title.yearStart}–${title.yearEnd}`
    : `${title.yearStart}`;

  return (
    <Link href={`/title/${title.id}`} className="card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={posterUrl(title.posterKey)} alt={`${title.title} poster`} />
      <div className="card-body">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>{title.title}</h3>
          {(!title.runtime || title.yearStart >= 2025) && <span className="tag new-to-canon">✨ New</span>}
        </div>
        <div className="meta">
          {years} · {title.director ?? "—"}
        </div>
        {title.blurbTeaser && <p className="blurb">{title.blurbTeaser}</p>}
        <div className="tag-row">
          {title.representationHandling && (
            <span className="tag contextual">{REPRESENTATION_HANDLING_LABELS[title.representationHandling]}</span>
          )}
          {title.inclusionTypes.map((t) => (
            <span key={t} className="tag inclusion">
              {t === "led_by" ? ledByLabel(title.directorGender) : INCLUSION_TYPE_LABELS[t]}
            </span>
          ))}
          {title.themes.slice(0, 2).map((t) => (
            <span key={t} className="tag">
              {THEME_LABELS[t]}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
