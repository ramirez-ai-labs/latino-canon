import { describe, expect, it } from "vitest";
import { resolveBlurbSources, splitCitations, stripCitations } from "./blurb-sources.js";

describe("resolveBlurbSources", () => {
  it("rebuilds a legacy row's ids and texts the way ingest built them", () => {
    const resolved = resolveBlurbSources(
      [
        { kind: "synopsis", ref: "a-better-life-2011", quote: null },
        { kind: "credit", ref: "Chris Weitz", quote: null },
        { kind: "credit", ref: "Second Director", quote: null },
      ],
      { synopsis: "An Indigenous Latino American gardener in East L.A." },
    );
    expect(resolved.map((s) => [s.id, s.text])).toEqual([
      ["s1", "An Indigenous Latino American gardener in East L.A."],
      ["d0", "Directed by Chris Weitz."],
      ["d1", "Directed by Second Director."],
    ]);
  });

  it("keeps the id and text stored on newer rows", () => {
    const [s] = resolveBlurbSources([{ kind: "synopsis", ref: "x", quote: null, id: "s1", text: "Stored text." }], {
      synopsis: "Different, current synopsis.",
    });
    expect(s).toMatchObject({ id: "s1", text: "Stored text." });
  });
});

describe("citations", () => {
  const text = "A gardener works for wealthy landowners [s1]. Directed by Chris Weitz [d0].";

  it("strips markers for teasers", () => {
    expect(stripCitations(text)).toBe("A gardener works for wealthy landowners. Directed by Chris Weitz.");
  });

  it("splits text and cited ids in order", () => {
    expect(splitCitations(text)).toEqual([
      { text: "A gardener works for wealthy landowners" },
      { cite: "s1" },
      { text: ". Directed by Chris Weitz" },
      { cite: "d0" },
      { text: "." },
    ]);
  });

  it("handles a marker citing several sources", () => {
    const multi = "Directed by Javier Ruiz Caldera and Alberto de Toro [d0, d1].";
    expect(stripCitations(multi)).toBe("Directed by Javier Ruiz Caldera and Alberto de Toro.");
    expect(splitCitations(multi)).toEqual([
      { text: "Directed by Javier Ruiz Caldera and Alberto de Toro" },
      { cite: "d0" },
      { cite: "d1" },
      { text: "." },
    ]);
  });
});
