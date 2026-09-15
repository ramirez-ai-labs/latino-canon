import { describe, expect, it } from "vitest";
import { ledByLabel } from "./taxonomy.js";

describe("ledByLabel", () => {
  it("labels a confirmed female director Latina-directed", () => {
    expect(ledByLabel("female")).toBe("Latina-directed");
  });

  it("falls back to Latino-directed for male, non-binary, and unknown/unspecified", () => {
    expect(ledByLabel("male")).toBe("Latino-directed");
    expect(ledByLabel("non_binary")).toBe("Latino-directed");
    expect(ledByLabel(null)).toBe("Latino-directed");
    expect(ledByLabel(undefined)).toBe("Latino-directed");
  });
});
