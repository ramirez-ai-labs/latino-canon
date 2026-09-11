import { applyD1Migrations, env } from "cloudflare:test";

// Runs once per test file (isolated storage per file) so the fixture tests below start
// from the real schema in apps/api/migrations, not a hand-maintained copy of it.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
