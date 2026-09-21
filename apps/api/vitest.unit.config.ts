import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Plain Node vitest, not workerd - vi.mock() for local module replacement isn't
// supported under @cloudflare/vitest-pool-workers (it only mocks outbound requests,
// not the relative ES modules a worker imports), so anything that needs to mock a
// sibling module (e.g. hybrid.ts's retrievers) has to run here instead of
// vitest.config.ts. Naming (*.node.spec.ts) keeps this include list disjoint from
// vitest.config.ts's src/**/*.test.ts, so no file ever runs under both.
export default defineConfig({
  test: {
    include: ["src/**/*.node.spec.ts"],
  },
  resolve: {
    alias: {
      "@latino-canon/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
});
