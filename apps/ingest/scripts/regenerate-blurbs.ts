/**
 * Rewrite old blurbs under the current prompt, in batches of 10 (POST /regenerate-blurbs).
 * A rewrite replaces a blurb only if it passes the ingest gate; see src/blurb-regen.ts.
 *
 *   pnpm --filter @latino-canon/ingest regenerate:blurbs --dry-run   # backlog size, no AI calls
 *   pnpm --filter @latino-canon/ingest regenerate:blurbs 20          # a day's batch (~2k neurons)
 *
 * Budget rule (CLAUDE.md): one 70B job a day besides the ingest queue, capped at ~2k -
 * about 20 titles. The worker enforces it (src/budget.ts): on a day that already had a
 * different 70B job (an eval), the call is refused (409). To run anyway, give a reason:
 *
 *   pnpm --filter @latino-canon/ingest regenerate:blurbs 20 --override "why today"
 *
 * Requires INGEST_URL and INGEST_ADMIN_TOKEN in the environment.
 */
export {}; // module scope - keeps this script's top-level consts from colliding with sibling scripts'

const token = process.env.INGEST_ADMIN_TOKEN ?? "dev-only-change-me";
const url = process.env.INGEST_URL ?? "http://localhost:8788";
const dryRun = process.argv.includes("--dry-run");
const overrideAt = process.argv.indexOf("--override");
const overrideReason = overrideAt >= 0 ? process.argv[overrideAt + 1] : undefined;
const total = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 20);

interface RegenResult {
  considered: number;
  byReason: Record<string, number>;
  replaced: string[];
  held: { titleId: string; score: number | null; problems: string[]; unsupported: string[] }[];
  errors: string[];
  next?: { titleId: string; reason: string }[];
}

async function call(limit: number): Promise<RegenResult> {
  const res = await fetch(`${url}/regenerate-blurbs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ limit, dryRun, ...(overrideReason ? { overrideReason } : {}) }),
  });
  if (res.status === 409) {
    const { reason } = (await res.json()) as { reason: string };
    throw new Error(`Workers AI budget: ${reason}. Run another day, or pass --override "<reason>".`);
  }
  if (!res.ok) throw new Error(`regenerate-blurbs failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as RegenResult;
}

async function main(): Promise<void> {
  if (dryRun) {
    const r = await call(10);
    console.log(`Backlog: ${r.considered} blurbs to rewrite`, r.byReason);
    console.log("Next batch:", r.next);
    return;
  }
  let done = 0;
  const replaced: string[] = [];
  const held: RegenResult["held"] = [];
  while (done < total) {
    const r = await call(Math.min(10, total - done));
    const attempted = r.replaced.length + r.held.length + r.errors.length;
    replaced.push(...r.replaced);
    held.push(...r.held);
    for (const e of r.errors) console.error("error:", e);
    done += attempted;
    console.log(`batch: ${r.replaced.length} replaced, ${r.held.length} held, ${r.errors.length} errors - ${r.considered - attempted} left in backlog`);
    if (attempted === 0) break;
  }
  console.log(`\nReplaced ${replaced.length}/${replaced.length + held.length}:`, replaced.join(", "));
  for (const h of held) console.log(`held ${h.titleId} (score ${h.score ?? "—"}): ${[...h.problems, ...h.unsupported].join(" · ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
