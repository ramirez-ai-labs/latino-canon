import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./rank.js";

describe("reciprocalRankFusion", () => {
  it("ranks a title appearing high in both lists above one appearing in only one", () => {
    const lexical = [
      { titleId: "a", score: 9 },
      { titleId: "b", score: 4 },
      { titleId: "c", score: 1 },
    ];
    const semantic = [
      { titleId: "a", score: 0.9 },
      { titleId: "d", score: 0.8 },
      { titleId: "b", score: 0.2 },
    ];

    const fused = reciprocalRankFusion([lexical, semantic]);

    expect(fused[0]?.titleId).toBe("a");
    expect(fused.map((h) => h.titleId)).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
  });

  it("respects list weights", () => {
    const l1 = [{ titleId: "x", score: 1 }];
    const l2 = [{ titleId: "y", score: 1 }];
    const fused = reciprocalRankFusion([l1, l2], { weights: [5, 1] });
    expect(fused[0]?.titleId).toBe("x");
  });
});
