export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">About Latino Canon</h1>
      <p className="text-[0.95rem] leading-relaxed text-text/90">
        Latino Canon indexes Latino-led films and series and makes them searchable by
        plot, theme, era, or filmmaker — in English or Spanish.
      </p>
      <div>
        <h2 className="mb-2 text-lg font-semibold">How a title qualifies</h2>
        <p className="text-[0.95rem] leading-relaxed text-text/90">
          Every title carries at least one <em>inclusion type</em>: Latino-directed,
          Latino-created, about the community, or a breakthrough first. A classifier
          proposes these from metadata; an editor reviews low-confidence calls. The tag
          and its rationale are shown on every card.
        </p>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">AI, disclosed</h2>
        <p className="text-[0.95rem] leading-relaxed text-text/90">
          &ldquo;Why it matters&rdquo; notes are model-generated, grounded in cited sources,
          and editor-approved before they appear. Search combines keyword (BM25) and
          semantic (embedding) retrieval.
        </p>
      </div>
    </article>
  );
}
