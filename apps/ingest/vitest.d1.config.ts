import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { fileURLToPath } from "node:url";

// apps/api/migrations is the actual source of truth for the shared D1 schema (both
// workers bind the same "latino-canon" database) - reused here rather than a
// hand-maintained copy of it.
const migrationsPath = fileURLToPath(new URL("../api/migrations", import.meta.url));
const migrations = await readD1Migrations(migrationsPath);

// Separate config from vitest.config.ts (which stays plain-node for the existing
// pure-logic tests) rather than switching the whole package to workerd - zero risk
// of changing runtime behavior for tests that were already passing. Only D1-backed
// tests (*.d1.spec.ts) run here, on workerd via Miniflare, real bindings, fully
// local - same reasoning as apps/api/vitest.config.ts.
export default defineWorkersConfig({
  test: {
    include: ["src/**/*.d1.spec.ts"],
    setupFiles: ["./src/test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      },
    },
  },
  resolve: {
    alias: {
      "@latino-canon/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
});
