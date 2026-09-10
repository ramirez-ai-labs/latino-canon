import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default config: no ISR cache override, no extra queues. Everything dynamic hits the
// api worker (which does its own KV caching). Add an R2 incremental cache here later
// if title pages become worth pre-rendering.
export default defineCloudflareConfig({});
