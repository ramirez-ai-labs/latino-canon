import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Numbers have been reused twice: 0012 (deduplicate_titles / restore_data_lost_by_0010_rebuild)
 * and 0027 (#262 and #275, the same day). Wrangler applies by file name, so all of them ran
 * - but a shared number hides which came first and invites a real clash. Applied migrations
 * can't be renamed (wrangler would run them again), so those two are allowlisted and every
 * new number must be unique.
 */
const KNOWN_DUPLICATES = new Set(["0012", "0027"]);

describe("migrations", () => {
  it("each new migration has its own number", () => {
    const dir = fileURLToPath(new URL("../migrations", import.meta.url));
    const numbers = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 4));
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i && !KNOWN_DUPLICATES.has(n));
    expect(dupes).toEqual([]);
  });
});
