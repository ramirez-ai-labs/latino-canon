import { describe, expect, it } from "vitest";
import { groundednessJudgeUser, parseGroundednessVerdict, passesBlurbGate } from "./groundedness.js";

describe("groundednessJudgeUser", () => {
  it("keeps the v3 input format the eval baseline was scored on", () => {
    expect(
      groundednessJudgeUser("Heli (2013) is directed by Amat Escalante [d0].", [
        { id: "s1", text: "A young man in rural Mexico." },
        { id: "d0", text: "Heli (2013) is directed by Amat Escalante." },
      ]),
    ).toBe(
      "BLURB:\nHeli (2013) is directed by Amat Escalante [d0].\n\nSOURCES:\n[s1] A young man in rural Mexico.\n[d0] Heli (2013) is directed by Amat Escalante.",
    );
  });
});

describe("parseGroundednessVerdict", () => {
  it("reads score and unsupported claims, fenced or not", () => {
    expect(parseGroundednessVerdict('```json\n{"score": 0.5, "unsupported": ["It matters as a portrayal of border life."]}\n```')).toEqual({
      score: 0.5,
      unsupported: ["It matters as a portrayal of border life."],
    });
  });

  it("scores a missing or non-numeric score as 0", () => {
    expect(parseGroundednessVerdict('{"unsupported": []}').score).toBe(0);
    expect(parseGroundednessVerdict('{"score": "high"}').score).toBe(0);
  });

  it("throws on a reply with no JSON, so callers can tell a judge failure from a low score", () => {
    expect(() => parseGroundednessVerdict("The blurb looks well supported overall.")).toThrow();
  });
});

describe("passesBlurbGate", () => {
  it("passes only a fully supported blurb", () => {
    expect(passesBlurbGate({ score: 1, unsupported: [] })).toBe(true);
    expect(passesBlurbGate({ score: 0.75, unsupported: ["x"] })).toBe(false);
    expect(passesBlurbGate({ score: 0.5, unsupported: ["It matters as a portrayal of counter-culture"] })).toBe(false);
  });

  it("fails a perfect score that still lists an unsupported claim", () => {
    expect(passesBlurbGate({ score: 1, unsupported: ["It is part of the Latino film canon."] })).toBe(false);
  });
});
