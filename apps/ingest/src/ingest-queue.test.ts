import { describe, expect, it } from "vitest";
import type { SeedTitle } from "./seed-diff.js";
import { planQueue, type JobRow } from "./ingest-queue.js";
import { jobIdFor } from "./workflow-rules.js";

const film = (title: string, year: number, tmdbId?: number): SeedTitle => ({
  ref: `${title} (${year})`,
  title,
  year,
  kind: "film",
  tmdbId,
  seedInclusionTypes: ["led_by"],
});
const job = (t: SeedTitle, status: string, tmdbId?: number): JobRow => ({
  id: jobIdFor(t.ref),
  status,
  params: JSON.stringify({ ref: t.ref, tmdbId }),
});

const heli = film("Heli", 2013, 186935);
const araby = film("Araby", 2017, 434370);
const coco = film("Coco", 2017, 354912);

describe("planQueue", () => {
  it("picks pinned entries that aren't live, in seed order, up to the limit", () => {
    const plan = planQueue([heli, coco, araby], [{ tmdbId: 354912, kind: "film" }], [], 1);
    expect(plan.picked.map((t) => t.ref)).toEqual(["Heli (2013)"]);
    expect(plan.eligible).toBe(2);
  });

  it("re-queues an entry whose pin was corrected - the earlier job tried a different id", () => {
    // Heli's old pin (202389) resolved to a 1968 cartoon and failed the name check.
    const plan = planQueue([heli], [], [job(heli, "error", 202389)], 5);
    expect(plan.picked).toEqual([heli]);
  });

  it("holds an entry whose current pin already failed, is in flight, or is in review", () => {
    const plan = planQueue(
      [heli, araby, coco],
      [],
      [job(heli, "error", 186935), job(araby, "running", 434370), job(coco, "needs_review", 354912)],
      5,
    );
    expect(plan.picked).toEqual([]);
    expect(plan.held.map((h) => h.reason)).toEqual([
      "failed with this tmdbId - see GET /jobs",
      "job running",
      "job needs_review",
    ]);
  });

  it("matches TMDB ids per media type - a movie and a series can share a number", () => {
    const series = { ...film("Vida", 2018, 354912), kind: "series" as const };
    const plan = planQueue([series], [{ tmdbId: 354912, kind: "film" }], [], 5);
    expect(plan.picked).toEqual([series]);
  });

  it("skips unpinned entries rather than guessing", () => {
    expect(planQueue([film("Selena", 1997)], [], [], 5).eligible).toBe(0);
  });

  it("a limit of 0 pauses the queue", () => {
    expect(planQueue([heli], [], [], 0).picked).toEqual([]);
  });
});
