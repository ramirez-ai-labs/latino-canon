import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import type { Env } from "../bindings.js";

// wrangler.test.jsonc only actually binds DB (+ TEST_MIGRATIONS, injected by
// vitest.d1.config.ts) — `extends Env` here is the type-checker's shape, not a
// runtime promise. Tests that reach for AI/VECTORIZE/INGEST_WORKFLOW/etc. would fail
// at runtime, which is the point: this suite is meant to stay local, and persist.ts's
// D1-only functions (persistTitle/writeTags/writeBlurb/setJob) plus
// maintenance.ts's retryErroredJobs only touch env.DB.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
