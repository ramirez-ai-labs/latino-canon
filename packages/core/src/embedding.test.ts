import { describe, expect, it } from "vitest";
import { titleEmbeddingText, titleVectorMetadata } from "./embedding.js";

describe("titleEmbeddingText", () => {
  it("includes genres and human-readable theme labels", () => {
    const text = titleEmbeddingText({
      title: "Coco",
      originalTitle: null,
      synopsis: "A boy journeys to the Land of the Dead.",
      themes: ["family", "coming_of_age"],
      genres: ["Animation", "Family"],
    });
    expect(text).toBe(
      "Coco\nA boy journeys to the Land of the Dead.\nGenres: Animation, Family\nThemes: Family, Coming of age",
    );
  });

  it("drops an original title identical to the display title and empty sections", () => {
    const text = titleEmbeddingText({ title: "Selena", originalTitle: "Selena", synopsis: null, themes: [], genres: [] });
    expect(text).toBe("Selena");
  });
});

describe("titleVectorMetadata", () => {
  it("carries the kind and decade that filterToVectorize pushes down", () => {
    expect(titleVectorMetadata({ kind: "film", yearStart: 2017 })).toEqual({ kind: "film", decade: 2010 });
  });
});
