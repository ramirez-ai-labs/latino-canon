import type { D1Migration } from "cloudflare:test";
import type { Env as WorkerEnv } from "../bindings.js";

// wrangler.test.jsonc only actually binds DB (+ TEST_MIGRATIONS, injected by
// vitest.d1.config.ts) — `extends WorkerEnv` here is the type-checker's shape, not a
// runtime promise. Tests that reach for AI/VECTORIZE/INGEST_WORKFLOW/etc. would fail
// at runtime, which is the point: this suite is meant to stay local, and persist.ts's
// D1-only functions (persistTitle/writeTags/writeBlurb/setJob) plus
// maintenance.ts's retryErroredJobs only touch env.DB.
// vitest-pool-workers 0.22 types `env` from "cloudflare:test" as `Cloudflare.Env`
// (ProvidedEnv is gone), so that's the interface to extend.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
