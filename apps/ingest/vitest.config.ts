import { defineConfig } from "vitest/config";

// Plain node environment: these tests exercise pure mapping logic (TMDB/OMDb → our
// shapes) with a mocked `fetch`, not Workers bindings — no pool-workers needed here.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
