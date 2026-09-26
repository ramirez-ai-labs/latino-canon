import { describe, expect, it } from "vitest";
import type { Title } from "@latino-canon/core";
import { blurbSources } from "./ai.js";

const title = (overrides: Partial<Title> = {}): Title =>
  ({
    id: "heli-2013",
    imdbId: "tt2852376",
    title: "Heli",
    yearStart: 2013,
    synopsis: "A young man in rural Mexico is drawn into the drug war.",
    credits: [
      { role: "director", order: 0, person: { name: "Amat Escalante" } },
      { role: "cast", order: 0, person: { name: "Armando Espitia" } },
    ],
    ...overrides,
  }) as Title;

describe("blurbSources", () => {
  it("names the work in each credit, so the model can refer to it and the judge can check it", () => {
    expect(blurbSources(title(), null).map((s) => [s.id, s.kind, s.text])).toEqual([
      ["s1", "synopsis", "A young man in rural Mexico is drawn into the drug war."],
      ["d0", "credit", "Heli (2013) is directed by Amat Escalante."],
    ]);
  });

  it("adds OMDb's awards line as a citable source", () => {
    const award = blurbSources(title(), "Won 1 award at Cannes. 12 wins & 20 nominations total.").find((s) => s.kind === "award");
    expect(award).toMatchObject({
      id: "a1",
      ref: "tt2852376",
      text: "Heli (2013) awards (OMDb): Won 1 award at Cannes. 12 wins & 20 nominations total.",
    });
  });

  it("skips the synopsis source when there is no synopsis", () => {
    expect(blurbSources(title({ synopsis: null }), null).map((s) => s.id)).toEqual(["d0"]);
  });
});
