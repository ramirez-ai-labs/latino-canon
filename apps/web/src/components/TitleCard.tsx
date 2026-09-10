import Link from "next/link";
import {
  INCLUSION_TYPE_LABELS,
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
        <h3>{title.title}</h3>
        <div className="meta">
          {years} · {title.director ?? "—"}
        </div>
        {title.blurbTeaser && <p className="blurb">{title.blurbTeaser}</p>}
        <div className="tag-row">
          {title.inclusionTypes.map((t) => (
            <span key={t} className="tag inclusion">
              {INCLUSION_TYPE_LABELS[t]}
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
