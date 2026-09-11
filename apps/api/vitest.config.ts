import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { fileURLToPath } from "node:url";

const migrationsPath = fileURLToPath(new URL("./migrations", import.meta.url));
const migrations = await readD1Migrations(migrationsPath);

// Runs on workerd (via Miniflare), not Node — real bindings, but fully local: the
// pure-logic tests (e.g. rewrite-query) don't touch a binding at all, and the D1-backed
// ones (e.g. lexical retrieval) use wrangler.test.jsonc, which only declares DB. No
// Cloudflare account or network access is required to run this suite.
export default defineWorkersConfig({
  test: {
    include: ["src/**/*.test.ts"],
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
      "@latino-canon/eval": fileURLToPath(new URL("../../packages/eval/src/index.ts", import.meta.url)),
    },
  },
});
