import { applyD1Migrations, env } from "cloudflare:test";

// Runs once per test file (isolated storage per file) so the D1-backed tests below
// start from the real schema in apps/api/migrations - the actual source of truth,
// not a hand-maintained copy of it - same pattern as apps/api's own D1-backed tests.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
