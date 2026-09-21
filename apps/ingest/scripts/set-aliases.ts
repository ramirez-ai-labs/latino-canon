/**
 * Backfill aliases for a title already in production - the ingest Workflow only
 * writes aliases for titles going through it for the first time (IngestParams.aliases),
 * so an existing title needs this instead of a `force: true` re-ingest (which re-runs
 * classify/blurb for no reason and risks the exact kind of unintended overwrite the
 * Firefly incident already taught this project to avoid).
 *
 *   pnpm --filter @latino-canon/ingest exec tsx scripts/set-aliases.ts <titleId> <kind> <alias> [<alias>...]
 *   pnpm --filter @latino-canon/ingest exec tsx scripts/set-aliases.ts \
 *     y-tu-mama-tambien-2001 translation "And Your Mother Too"
 *
 * Requires INGEST_ADMIN_TOKEN in the environment. Overwrites, not appends - re-running
 * with a different alias list for the same title replaces the old one.
 */
export {}; // no imports otherwise - keeps this file's scope isolated from other scripts

const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";
const url = process.env.INGEST_URL ?? "http://localhost:8788";

const [titleId, kind, ...rest] = process.argv.slice(2);
if (!titleId || !kind || rest.length === 0) {
  console.error("usage: set-aliases.ts <titleId> <kind> <alias> [<alias>...]");
  process.exit(1);
}

async function setAliases(): Promise<void> {
  const aliases = rest.map((alias) => ({ alias, kind }));
  const res = await fetch(`${url}/aliases`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ titleId, aliases }),
  });

  const text = await res.text();
  console.log(`Response (${res.status}):`, text);
  if (!res.ok) throw new Error(`set-aliases request failed: ${res.status} ${text}`);
}

setAliases().catch((e) => {
  console.error(e);
  process.exit(1);
});
