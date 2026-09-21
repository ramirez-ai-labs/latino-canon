import { Hono } from "hono";
import { OPENAPI_SPEC } from "../openapi/spec.js";

export const openapiRoute = new Hono();

/**
 * GET /openapi.json
 *
 * Returns the OpenAPI 3.0 specification for the Latino Canon API.
 * Useful for API documentation, client generation, and discovery.
 */
openapiRoute.get("/", (c) => {
  c.header("Content-Type", "application/json");
  return c.json(OPENAPI_SPEC);
});

/**
 * GET /openapi.yaml (optional: could add YAML serialization)
 * Future enhancement: serialize OPENAPI_SPEC to YAML for tools that prefer it
 */
