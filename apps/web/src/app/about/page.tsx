export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article style={{ maxWidth: 640 }}>
      <h1>About Latino Canon</h1>
      <p>
        Latino Canon indexes Latino-led films and series and makes them searchable by
        plot, theme, era, or filmmaker — in English or Spanish.
      </p>
      <h2>How a title qualifies</h2>
      <p>
        Every title carries at least one <em>inclusion type</em>: Latino-directed,
        Latino-created, about the community, or a breakthrough first. A classifier
        proposes these from metadata; an editor reviews low-confidence calls. The tag
        and its rationale are shown on every card.
      </p>
      <h2>AI, disclosed</h2>
      <p>
        &ldquo;Why it matters&rdquo; notes are model-generated, grounded in cited sources,
        and editor-approved before they appear. Search combines keyword (BM25) and
        semantic (embedding) retrieval.
      </p>
    </article>
  );
}
