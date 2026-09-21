/**
 * OpenAPI 3.0 specification for Latino Canon API.
 * Generated statically from route documentation.
 */
export const OPENAPI_SPEC = {
  openapi: "3.0.0",
  info: {
    title: "Latino Canon API",
    description: "Hybrid semantic + lexical search over a curated catalog of Latino films and series.",
    version: "1.0.0",
    contact: {
      name: "Latino Canon",
      url: "https://github.com/ramirez-ai-labs/latino-canon",
    },
  },
  servers: [
    {
      url: "https://latino-canon-api.ai-builders-studio-latinx.workers.dev",
      description: "Production API (Cloudflare Workers)",
    },
  ],
  paths: {
    "/search": {
      get: {
        operationId: "search",
        summary: "Search the film catalog",
        description: "Hybrid search combining BM25 lexical + semantic retrieval with RRF ranking.",
        tags: ["Search"],
        parameters: [
          {
            name: "q",
            in: "query",
            description: "Search query (natural language or keywords)",
            required: true,
            schema: { type: "string", minLength: 1 },
            example: "border crossing",
          },
          {
            name: "mode",
            in: "query",
            description: "Retrieval mode: 'hybrid' (default), 'lexical' (BM25), or 'semantic' (embeddings)",
            required: false,
            schema: { type: "string", enum: ["hybrid", "lexical", "semantic"], default: "hybrid" },
          },
          {
            name: "limit",
            in: "query",
            description: "Maximum results to return (1-100, default 20)",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: "offset",
            in: "query",
            description: "Pagination offset (for infinite scroll)",
            required: false,
            schema: { type: "integer", minimum: 0, default: 0 },
          },
          {
            name: "country",
            in: "query",
            description: "Filter by ISO 3166-1 country code (e.g., 'MX', 'AR', 'BR')",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "decade",
            in: "query",
            description: "Filter by decade (e.g., 1980, 1990, 2000)",
            required: false,
            schema: { type: "integer" },
          },
          {
            name: "theme",
            in: "query",
            description: "Filter by theme (e.g., 'family', 'identity', 'activism')",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "inclusionType",
            in: "query",
            description: "Filter by inclusion type (e.g., 'led_by', 'created_by', 'about_community')",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "kind",
            in: "query",
            description: "Filter by media type (film or series)",
            required: false,
            schema: { type: "string", enum: ["film", "series"] },
          },
        ],
        responses: {
          "200": {
            description: "Search results with ranked films/series",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Original search query" },
                    mode: { type: "string", enum: ["hybrid", "lexical", "semantic"] },
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "el-norte-1983" },
                          title: { type: "string", example: "El Norte" },
                          year: { type: "integer", example: 1983 },
                          kind: { type: "string", enum: ["film", "series"] },
                          synopsis: { type: "string" },
                          posterKey: { type: "string", nullable: true },
                          themes: { type: "array", items: { type: "string" } },
                          inclusionTypes: { type: "array", items: { type: "string" } },
                        },
                      },
                    },
                    tookMs: { type: "number", description: "Query execution time in milliseconds" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid query parameters",
          },
        },
      },
    },
    "/titles": {
      get: {
        operationId: "listTitles",
        summary: "List all titles in the catalog",
        description: "Get a paginated list of all titles with optional filtering.",
        tags: ["Catalog"],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100, maximum: 10000 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
          {
            name: "hasBlurb",
            in: "query",
            description: "Filter to only titles with AI-generated blurbs (for eval pipelines)",
            schema: { type: "integer", enum: [0, 1] },
          },
        ],
        responses: {
          "200": {
            description: "List of titles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    titleIds: { type: "array", items: { type: "string" } },
                    count: { type: "integer" },
                    limited: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/collections/{slug}": {
      get: {
        operationId: "getCollection",
        summary: "Get a curated collection",
        tags: ["Collections"],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string", example: "core-canon" },
          },
        ],
        responses: {
          "200": {
            description: "Collection with titles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    slug: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    kind: { type: "string", enum: ["curated", "smart"] },
                    items: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "404": { description: "Collection not found" },
        },
      },
    },
  },
  components: {
    schemas: {
      Title: {
        type: "object",
        properties: {
          id: { type: "string", description: "URL-safe title slug" },
          title: { type: "string" },
          year: { type: "integer" },
          kind: { type: "string", enum: ["film", "series"] },
          countries: { type: "array", items: { type: "string" } },
          synopsis: { type: "string" },
          themes: { type: "array", items: { type: "string" } },
          inclusionTypes: { type: "array", items: { type: "string" } },
          posterKey: { type: "string", nullable: true },
        },
      },
    },
  },
  tags: [
    {
      name: "Search",
      description: "Hybrid semantic + lexical search endpoints",
    },
    {
      name: "Catalog",
      description: "Browse and query the title catalog",
    },
    {
      name: "Collections",
      description: "Curated and smart collections",
    },
  ],
};
