import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Plain node environment is enough for the pure-logic tests checked in here.
// Add @cloudflare/vitest-pool-workers when you want tests that exercise real bindings.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@latino-canon/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
});
