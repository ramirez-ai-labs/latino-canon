/**
 * Smoke test for the deployed web app: fetches the pages a reader actually uses and checks
 * each renders what it should. Runs in deploy-web.yml after every deploy; apps/web has no
 * unit tests, and the OpenNext build can pass while a page throws at request time.
 *
 *   WEB_URL=https://latino-canon-web.ai-builders-studio-latinx.workers.dev pnpm exec tsx scripts/smoke-web.ts
 *
 * Zero Workers AI neurons: search is checked by browsing (a filter, no query), which skips
 * the query rewrite and the embedding; title, Evals and About pages only read D1/Vectorize.
 *
 * Themes: light/dark is chosen in the browser (localStorage + an inline script), so the
 * server sends one HTML for both. What CI can verify is that both halves ship - the init
 * script in the page and both palettes in the stylesheet - which is what breaks if the
 * theme wiring regresses. A new deploy can take a few seconds to serve everywhere, so each
 * check retries before it fails.
 */
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = (process.env.WEB_URL ?? "https://latino-canon-web.ai-builders-studio-latinx.workers.dev").replace(/\/$/, "");
const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS ?? 6);
const RETRY_MS = 10_000;
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

interface Page {
  status: number;
  html: string;
}

async function get(path: string): Promise<Page> {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow", headers: { "user-agent": "latino-canon-smoke" } });
  return { status: res.status, html: await res.text() };
}

/** Returns a failure reason, or null when the page is right. */
type Check = { name: string; run: () => Promise<string | null> };

const expectPage = (path: string, status: number, needles: (string | RegExp)[]) => async (): Promise<string | null> => {
  const page = await get(path);
  if (page.status !== status) return `HTTP ${page.status}, expected ${status}`;
  const missing = needles.filter((n) => (typeof n === "string" ? !page.html.includes(n) : !n.test(page.html)));
  return missing.length ? `missing ${missing.map(String).join(", ")}` : null;
};

const CHECKS: Check[] = [
  { name: "home", run: expectPage("/", 200, ["Latino", "searchable", "lc-theme"]) },
  // Browsing, not a query: renders the search page and result cards with no AI call.
  { name: "search (browse series)", run: expectPage("/search?kind=series", 200, [/href="\/title\/[a-z0-9-]+"/]) },
  { name: "title page", run: expectPage("/title/coco-2017", 200, ["Coco", "Why it matters", /More like this|Related titles/]) },
  { name: "evals", run: expectPage("/eval", 200, ["Evals", "Search quality over time"]) },
  // The colophon must name this release - the version the deploy was built from.
  { name: "about + edition", run: expectPage("/about", 200, ["About Latino Canon", "Edition", `v${version}`]) },
  { name: "unknown title is a 404", run: expectPage("/title/no-such-title-0000", 404, ["find that page"]) },
  {
    name: "both themes ship",
    run: async () => {
      const home = await get("/");
      if (!/localStorage\.getItem\("lc-theme"\)/.test(home.html)) return "theme init script missing from <head>";
      const css = [...home.html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]!);
      if (css.length === 0) return "no stylesheet linked";
      const sheets = await Promise.all(css.map((href) => get(href).then((p) => p.html)));
      const all = sheets.join("\n");
      const lacks = [
        [/\[data-theme=["']?dark["']?\]/, "the dark-theme selector"],
        [/#f4efe6/i, "Cartelera paper (light)"],
        [/#121110/i, "Filmoteca charcoal (dark)"],
      ].filter(([re]) => !(re as RegExp).test(all));
      return lacks.length ? `stylesheet lacks ${lacks.map(([, what]) => what).join(", ")}` : null;
    },
  },
];

async function runWithRetry(check: Check): Promise<string | null> {
  let reason: string | null = "not run";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      reason = await check.run();
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
    if (reason === null) return null;
    if (attempt < ATTEMPTS) await sleep(RETRY_MS);
  }
  return reason;
}

async function main(): Promise<void> {
  console.log(`Smoke-testing ${BASE} (release v${version})`);
  let failed = 0;
  for (const check of CHECKS) {
    const reason = await runWithRetry(check);
    if (reason) failed++;
    console.log(`${reason ? "✗" : "✓"} ${check.name}${reason ? ` - ${reason}` : ""}`);
  }
  if (failed) {
    console.error(`\n${failed} of ${CHECKS.length} checks failed`);
    process.exit(1);
  }
  console.log(`\nAll ${CHECKS.length} checks passed`);
}

void main();
