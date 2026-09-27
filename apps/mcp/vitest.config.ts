import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain node: the tools only call a fetcher, which tests replace with a fake api, and the
// MCP transport is built on web-standard Request/Response - no Workers bindings needed.
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
