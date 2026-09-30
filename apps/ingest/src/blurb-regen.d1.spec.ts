import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Title } from "@latino-canon/core";
import type { Env } from "./bindings.js";
import { regenerateBlurbs } from "./blurb-regen.js";
import { persistTitle, writeBlurb } from "./persist.js";

// Real D1 (migrated), fake Workers AI: the blurb call returns `rewrite`, the judge call
// returns `verdict`. Titles have no imdbId, so no OMDb fetch leaves the test.
function withAi(rewrite: string, verdict: { score: number; unsupported: string[] }) {
  const calls: string[] = [];
  const testEnv = {
    ...env,
    AI: {
      run: (_model: string, input: { messages: { content: string }[] }) => {
        const isBlurb = input.messages[0]!.content.startsWith("You write a 2-sentence note");
        calls.push(isBlurb ? "blurb" : "judge");
        return Promise.resolve({ response: JSON.stringify(isBlurb ? { text: rewrite, claims: [] } : verdict) });
      },
    },
  } as unknown as Env;
  return { testEnv, calls };
}

const title = (id: string, popularity: number): Title => ({
  id,
  tmdbId: popularity,
  imdbId: null,
  kind: "film",
  title: id,
  originalTitle: id,
  yearStart: 2020,
  yearEnd: null,
  country: ["MX"],
  language: ["es"],
  synopsis: "A young man in rural Mexico is drawn into the drug war.",
  posterKey: null,
  popularity,
  runtime: 100,
  credits: [],
  tags: [],
  blurb: null,
  representationHandling: null,
  contextNotes: [],
  oscarWin: null,
  genres: [],
  contentAdvisory: null,
});

const OLD = "A young man in rural Mexico [s1]. It matters as a portrayal of the drug war.";
const GOOD = "Heli (2020) follows a young man in rural Mexico drawn into the drug war [s1]. It won 18 awards [a1].";
const blurb = (text: string) => ({ result: { text, claims: [] }, sources: [], model: "old-model" });
const read = (id: string) =>
  env.DB.prepare("SELECT text, approved, approved_by, groundedness, regen_attempted_at FROM blurbs WHERE title_id = ?")
    .bind(id)
    .first<{ text: string; approved: number; approved_by: string | null; groundedness: number | null; regen_attempted_at: string | null }>();

// Every test starts from the same three blurbs. vitest-pool-workers used to roll storage
// back after each test; since 0.22 (vitest 4) it isolates per file, so a replaced or
// attempted blurb would leak into the next test - reset and reseed instead.
const IDS = ["regen-pass-2020", "regen-held-2020", "regen-fine-2020"] as const;

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM blurbs WHERE title_id IN (${IDS.map(() => "?").join(",")})`)
    .bind(...IDS)
    .run();
  for (const [id, pop] of [["regen-pass-2020", 50], ["regen-held-2020", 40], ["regen-fine-2020", 30]] as const) {
    await persistTitle(env, title(id, pop));
  }
  await writeBlurb(env, "regen-pass-2020", blurb(OLD));
  await writeBlurb(env, "regen-held-2020", blurb(OLD));
  await writeBlurb(env, "regen-fine-2020", blurb(GOOD));
  await env.DB.prepare("UPDATE blurbs SET approved = 1").run();
});

describe("regenerateBlurbs", () => {
  it("dry run sizes the backlog and names the next batch without any AI call", async () => {
    const { testEnv, calls } = withAi(GOOD, { score: 1, unsupported: [] });
    const r = await regenerateBlurbs(testEnv, { limit: 10, dryRun: true });
    expect(r.byReason.significance).toBe(2);
    expect(r.next?.map((n) => n.titleId)).toEqual(["regen-pass-2020", "regen-held-2020"]);
    expect(calls).toEqual([]);
  });

  it("replaces a blurb with a rewrite that passes the gate, approved by the judge", async () => {
    const { testEnv } = withAi(GOOD, { score: 1, unsupported: [] });
    const r = await regenerateBlurbs(testEnv, { limit: 1, dryRun: false });
    expect(r.replaced).toEqual(["regen-pass-2020"]);
    expect(await read("regen-pass-2020")).toMatchObject({ text: GOOD, approved: 1, approved_by: "judge", groundedness: 1 });
  });

  it("keeps the old blurbs untouched when the rewrites fail, and records the attempts", async () => {
    const { testEnv } = withAi("Heli (2020) is a film. It matters as a portrayal of the drug war [s1].", {
      score: 0.5,
      unsupported: ["It matters as a portrayal of the drug war"],
    });
    const r = await regenerateBlurbs(testEnv, { limit: 10, dryRun: false });
    expect(r.held.map((h) => h.titleId)).toEqual(["regen-pass-2020", "regen-held-2020"]);
    expect(r.replaced).toEqual([]);
    for (const id of ["regen-pass-2020", "regen-held-2020"]) {
      const row = await read(id);
      expect(row).toMatchObject({ text: OLD, approved: 1 });
      expect(row?.regen_attempted_at).not.toBeNull();
    }
    // Held titles wait RETRY_AFTER_DAYS: a second run the same day has nothing to do.
    expect((await regenerateBlurbs(testEnv, { limit: 10, dryRun: true })).considered).toBe(0);
  });

  it("holds a rewrite the judge passes but whose citations are wrong", async () => {
    const { testEnv } = withAi("Heli (2020) follows a young man in rural Mexico, according to s1. It won 18 awards.", {
      score: 1,
      unsupported: [],
    });
    const r = await regenerateBlurbs(testEnv, { limit: 1, dryRun: false });
    expect(r.held[0]?.problems).toEqual(expect.arrayContaining(["bare source id"]));
    expect((await read("regen-pass-2020"))?.text).toBe(OLD);
  });

  it("leaves nothing to redo once rewrites pass; a clean approved blurb is never a candidate", async () => {
    const { testEnv, calls } = withAi(GOOD, { score: 1, unsupported: [] });
    const first = await regenerateBlurbs(testEnv, { limit: 10, dryRun: false });
    expect(first.replaced).toEqual(["regen-pass-2020", "regen-held-2020"]);
    expect(calls).toHaveLength(4); // a blurb call and a judge call per title - none for regen-fine-2020
    expect((await regenerateBlurbs(testEnv, { limit: 10, dryRun: true })).considered).toBe(0);
  });
});
