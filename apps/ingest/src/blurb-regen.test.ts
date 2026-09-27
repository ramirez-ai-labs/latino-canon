import { describe, expect, it } from "vitest";
import { pickCandidates, regenReason, type BlurbRow } from "./blurb-regen.js";

const row = (o: Partial<BlurbRow> = {}): BlurbRow => ({
  titleId: "t-2020",
  text: "Heli (2013) follows a young man in rural Mexico [s1]. It won 18 awards [a1].",
  approved: 1,
  approvedBy: null,
  regenAttemptedAt: null,
  popularity: 5,
  ...o,
});

describe("regenReason", () => {
  it("leaves alone a blurb the current gate already approved", () => {
    expect(regenReason(row({ approvedBy: "judge", text: "It matters as a portrayal of border life." }))).toBeNull();
  });

  it("rewrites unapproved blurbs, and approved ones with an unsupported claim or bad citations", () => {
    expect(regenReason(row({ approved: 0 }))).toBe("unapproved");
    expect(regenReason(row({ text: "A film about a bodega owner [s1]. It matters as a portrayal of border life." }))).toBe("significance");
    expect(regenReason(row({ text: "It is part of the Latino film canon [s1]." }))).toBe("significance");
    expect(regenReason(row({ text: "Rat Fever is a film about a poet in Recife. It won 28 awards, according to OMDb." }))).toBe("citations");
  });

  it("keeps a clean, cited, approved blurb", () => {
    expect(regenReason(row())).toBeNull();
  });
});

describe("pickCandidates", () => {
  const now = new Date("2026-09-27T12:00:00Z");

  it("puts titles with no approved note first, then unsupported claims, most popular first", () => {
    const picked = pickCandidates(
      [
        row({ titleId: "cite", text: "No markers here at all." }),
        row({ titleId: "sig-low", text: "It matters as art [s1].", popularity: 1 }),
        row({ titleId: "sig-high", text: "It matters as art [s1].", popularity: 90 }),
        row({ titleId: "unapproved", approved: 0 }),
        row({ titleId: "fine" }),
      ],
      now,
      10,
    );
    expect(picked.map((p) => p.titleId)).toEqual(["unapproved", "sig-high", "sig-low", "cite"]);
  });

  it("waits a week before retrying a title the gate held, in D1's datetime format", () => {
    const picked = pickCandidates(
      [
        row({ titleId: "recent", approved: 0, regenAttemptedAt: "2026-09-25 08:00:00" }),
        row({ titleId: "stale", approved: 0, regenAttemptedAt: "2026-09-18 08:00:00" }),
      ],
      now,
      10,
    );
    expect(picked.map((p) => p.titleId)).toEqual(["stale"]);
  });

  it("respects the limit", () => {
    expect(pickCandidates([row({ approved: 0 }), row({ titleId: "b", approved: 0 })], now, 1)).toHaveLength(1);
  });
});
