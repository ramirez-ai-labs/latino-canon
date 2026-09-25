/**
 * OpenAPI 3.0 specification for Latino Canon API.
 * Written by hand from the routes and packages/core/src/schema.ts - keep in sync with both.
 */
const filterParam = (name: string, description: string, schema: Record<string, unknown>) => ({
  name,
  in: "query",
  required: false,
  description,
  schema,
});

export const OPENAPI_SPEC = {
  openapi: "3.0.0",
  info: {
    title: "Latino Canon API",
    description:
      "Hybrid semantic + lexical search, in English and Spanish, over a curated catalog of Latino films and series.",
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
        summary: "Search the catalog",
        description:
          "Hybrid search: BM25 keyword + bge-m3 semantic retrieval fused with Reciprocal Rank Fusion. " +
          "Filters passed as parameters always exclude. A natural-language `q` may also yield LLM-inferred " +
          "filters: for a filter-only query (\"animation films\") they exclude, relaxed one at a time if " +
          "nothing matches; for a query with real content they only boost matching titles. " +
          "`interpretation.filterMode` says which. Empty `q` lists titles by popularity.",
        tags: ["Search"],
        parameters: [
          {
            name: "q",
            in: "query",
            description: "Search query, English or Spanish (natural language or keywords). Empty = browse.",
            required: false,
            schema: { type: "string", maxLength: 200, default: "" },
            example: "animation films",
          },
          filterParam("mode", "Retrieval mode", { type: "string", enum: ["hybrid", "lexical", "semantic"], default: "hybrid" }),
          filterParam("limit", "Maximum results to return", { type: "integer", minimum: 1, maximum: 51, default: 50 }),
          filterParam("offset", "Pagination offset", { type: "integer", minimum: 0, default: 0 }),
          filterParam("kind", "Media type", { type: "string", enum: ["film", "series", "special"] }),
          filterParam("decade", "Release decade (start year, e.g. 1990)", { type: "integer" }),
          filterParam("country", "Production country, ISO 3166-1 alpha-2 (e.g. 'MX')", { type: "string", minLength: 2, maxLength: 2 }),
          filterParam("theme", "Theme slug (e.g. 'family', 'immigration')", { type: "string" }),
          filterParam("inclusionType", "Inclusion type (e.g. 'led_by', 'created_by', 'about_community')", { type: "string" }),
          filterParam("genre", "TMDB genre (e.g. 'Animation', 'Documentary')", { type: "string" }),
          filterParam("contentAdvisory", "'general' for family-appropriate titles", { type: "string", enum: ["general", "mature"] }),
        ],
        responses: {
          "200": {
            description: "Ranked results with the query's interpretation",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Original search query" },
                    mode: { type: "string", enum: ["hybrid", "lexical", "semantic"] },
                    interpretation: {
                      type: "object",
                      nullable: true,
                      description: "Set when the query rewrite interpreted a natural-language query",
                      properties: {
                        cleanedQuery: { type: "string" },
                        filters: { type: "object", description: "Inferred filters actually applied" },
                        rationale: { type: "string" },
                        source: { type: "string", enum: ["llm", "rules"] },
                        filterMode: {
                          type: "string",
                          enum: ["strict", "boost"],
                          description: "strict = inferred filters excluded titles; boost = they only re-ranked",
                        },
                      },
                    },
                    results: { type: "array", items: { $ref: "#/components/schemas/TitleCard" } },
                    tookMs: { type: "number", description: "Query execution time in milliseconds" },
                    degraded: {
                      type: "boolean",
                      description:
                        "Present (true) when semantic retrieval was unavailable, e.g. the Workers AI daily budget ran out, and results are keyword-only. Never cached.",
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid query parameters" },
          "429": { description: "Rate limited - 30 uncached queries per minute per client. See Retry-After." },
        },
      },
    },
    "/titles": {
      get: {
        operationId: "listTitles",
        summary: "List title ids",
        tags: ["Catalog"],
        parameters: [
          filterParam("limit", "Maximum ids", { type: "integer", default: 1000, maximum: 10000 }),
          filterParam("hasBlurb", "Only titles with an approved blurb (used by the groundedness eval)", { type: "integer", enum: [0, 1] }),
          filterParam("recent", "Most recently added titles first", { type: "integer", enum: [0, 1] }),
        ],
        responses: {
          "200": {
            description: "Title ids",
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
    "/titles/{id}": {
      get: {
        operationId: "getTitle",
        summary: "Get a full title",
        description:
          "Metadata, credits, tags with confidence, and the 'why it matters' blurb. Each blurb source carries the " +
          "id the blurb cites inline ([s1] synopsis, [d0] first director) and the text the blurb model was given.",
        tags: ["Catalog"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", example: "coco-2017" } }],
        responses: {
          "200": { description: "Full title" },
          "404": { description: "No such title in the canon" },
        },
      },
    },
    "/collections": {
      get: {
        operationId: "listCollections",
        summary: "List collections",
        tags: ["Collections"],
        responses: { "200": { description: "Collections" } },
      },
    },
    "/collections/{slug}": {
      get: {
        operationId: "getCollection",
        summary: "Get a curated or smart collection",
        tags: ["Collections"],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string", example: "core-canon" },
            description: "e.g. core-canon, border-stories, latina-directors, breakthrough-firsts",
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
                    items: { type: "array", items: { $ref: "#/components/schemas/TitleCard" } },
                  },
                },
              },
            },
          },
          "404": { description: "Collection not found" },
        },
      },
    },
    "/agents/curate": {
      post: {
        operationId: "curate",
        summary: "Curation agent",
        description:
          "Multi-step search with a visible reasoning trail, for signals /search can't act on: director gender, " +
          "lead-actor gender, tone. Rate-limited to 10 requests per minute per IP.",
        tags: ["Search"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["query"],
                properties: {
                  query: { type: "string", example: "films directed by women with a female lead" },
                  limit: { type: "integer", default: 5, maximum: 20 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "topResults, extractedIntent, and a step-by-step reasoning array" },
          "400": { description: "Missing or invalid query" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/eval-runs": {
      get: {
        operationId: "listEvalRuns",
        summary: "Recorded eval runs",
        description: "Retrieval and groundedness eval runs, newest first. Written only by CI.",
        tags: ["Evaluation"],
        parameters: [
          filterParam("type", "Eval type", { type: "string", enum: ["retrieval", "groundedness"] }),
          filterParam("limit", "Maximum runs", { type: "integer", default: 20, maximum: 100 }),
        ],
        responses: { "200": { description: "Eval runs" } },
      },
    },
  },
  components: {
    schemas: {
      TitleCard: {
        type: "object",
        properties: {
          id: { type: "string", description: "URL-safe title slug", example: "coco-2017" },
          kind: { type: "string", enum: ["film", "series", "special"] },
          title: { type: "string" },
          yearStart: { type: "integer" },
          yearEnd: { type: "integer", nullable: true },
          director: { type: "string", nullable: true },
          leadActor: { type: "string", nullable: true },
          posterKey: { type: "string", nullable: true },
          blurbTeaser: { type: "string", nullable: true },
          inclusionTypes: { type: "array", items: { type: "string" } },
          themes: { type: "array", items: { type: "string" } },
          genres: { type: "array", items: { type: "string" } },
          contentAdvisory: { type: "string", enum: ["general", "mature"], nullable: true },
          score: { type: "number" },
        },
      },
    },
  },
  tags: [
    { name: "Search", description: "Hybrid search and the curation agent" },
    { name: "Catalog", description: "Titles" },
    { name: "Collections", description: "Curated and smart collections" },
    { name: "Evaluation", description: "Recorded retrieval and groundedness eval runs" },
  ],
};
