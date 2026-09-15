/**
 * Insert seed titles directly into D1 without TMDB fetch or AI classification.
 * Use this for quick validation that seed data loads cleanly.
 * Run full ingest later with: pnpm seed (which does TMDB + classify + blurb)
 *
 *   pnpm --filter @latino-canon/ingest seed:only
 *
 * Requires INGEST_ADMIN_TOKEN in the environment.
 */
import seed from "../src/seed/canon.seed.json" with { type: "json" };

interface SeedTitle {
  ref: string;
  title: string;
  year: number;
  kind: "film" | "series";
  seedInclusionTypes?: string[];
}

const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";
const url = process.env.INGEST_URL ?? "http://localhost:8788";

async function seedOnly(titles: SeedTitle[]): Promise<void> {
  console.log(`Loading ${titles.length} seed titles into D1...`);

  const res = await fetch(`${url}/seed-load`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ titles }),
  });

  const text = await res.text();
  console.log(`Response (${res.status}):`, text);

  if (!res.ok) throw new Error(`seed-load request failed: ${res.status} ${text}`);
}

seedOnly(seed.titles as SeedTitle[]).catch((e) => {
  console.error(e);
  process.exit(1);
});
