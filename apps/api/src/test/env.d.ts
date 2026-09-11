import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import type { Env } from "../bindings.js";

// wrangler.test.jsonc only actually binds DB (+ TEST_MIGRATIONS, injected by
// vitest.config.ts) — `extends Env` here is the type-checker's shape, not a runtime
// promise. Tests that reach for AI/VECTORIZE/etc. would fail at runtime, which is the
// point: this suite is meant to stay local, and lexicalSearch only touches env.DB.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
