export const ingestOpenApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Latino Canon Ingest Admin API",
    description: "Admin-only API for managing the Latino Canon ingestion pipeline",
    version: "1.0.0",
    contact: {
      name: "GitHub",
      url: "https://github.com/ramirez-ai-labs/latino-canon",
    },
  },
  servers: [
    {
      url: "https://latino-canon-ingest.ai-builders-studio-latinx.workers.dev",
      description: "Production",
    },
  ],
  paths: {
    "/": {
      get: {
        summary: "Service info",
        description: "Get service status and documentation links",
        tags: ["Admin"],
        responses: {
          "200": {
            description: "Service running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    service: { type: "string" },
                    status: { type: "string" },
                    type: { type: "string" },
                    requires: { type: "string" },
                    docs: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/docs": {
      get: {
        summary: "Interactive API documentation",
        description: "Swagger UI with authentication",
        tags: ["Admin"],
        responses: {
          "200": {
            description: "Swagger UI page",
            content: { "text/html": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/ingest": {
      post: {
        summary: "Trigger ingestion workflows",
        description: "Kick off one Workflow per title for full ingestion pipeline",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  titles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        ref: { type: "string", example: "la-bamba-1987" },
                        kind: {
                          type: "string",
                          enum: ["film", "series"],
                        },
                        title: { type: "string" },
                        year: { type: "number" },
                        tmdbId: { type: "number", description: "Optional; pins to specific TMDB ID" },
                        aliases: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              alias: { type: "string" },
                              kind: { type: "string" },
                            },
                          },
                        },
                        seedInclusionTypes: {
                          type: "array",
                          items: { type: "string" },
                          example: ["led_by", "about_community"],
                        },
                      },
                      required: ["ref", "kind", "title", "year"],
                    },
                  },
                },
                required: ["titles"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Workflows started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    started: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
        },
      },
    },
    "/jobs": {
      get: {
        summary: "List pending and errored jobs",
        description: "Get review queue and error tracking (max 200 most recent)",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Ingest jobs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    jobs: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title_ref: { type: "string" },
                          status: {
                            type: "string",
                            enum: ["pending", "needs_review", "approved", "error"],
                          },
                          stage: { type: "string" },
                          error: { type: ["string", "null"] },
                          created_at: { type: "string", format: "date-time" },
                          updated_at: { type: "string", format: "date-time" },
                          params: { type: "object" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
        },
      },
    },
    "/seed-load": {
      post: {
        summary: "Load seed titles without classification",
        description: "Fast catalog initialization without TMDB fetching or Workers AI costs",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  titles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        ref: { type: "string" },
                        title: { type: "string" },
                        year: { type: "number" },
                        kind: { type: "string", enum: ["film", "series"] },
                        seedInclusionTypes: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["ref", "title", "year", "kind"],
                    },
                  },
                },
                required: ["titles"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Seed load result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    inserted: { type: "number" },
                    skipped: { type: "number" },
                    details: {
                      type: "object",
                      properties: {
                        inserted: { type: "array", items: { type: "string" } },
                        skipped: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
        },
      },
    },
    "/backfill-gender": {
      post: {
        summary: "Backfill director/cast gender from TMDB",
        description: "Update missing gender data for people already ingested",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  limit: { type: "number", default: 50 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Backfill result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    checked: { type: "number" },
                    updated: { type: "number" },
                    stillUnknown: { type: "number" },
                    errors: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
        },
      },
    },
    "/backfill-genres": {
      post: {
        summary: "Backfill title genres from TMDB",
        description: "Update titles whose genres are still the '[]' default - no Workers AI neurons spent",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  limit: { type: "number", default: 50 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Backfill result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    checked: { type: "number" },
                    updated: { type: "number" },
                    errors: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
        },
      },
    },
    "/backfill-content-advisory": {
      post: {
        summary: "Backfill content-advisory classification (general/mature)",
        description: "LLM-classifies titles whose content_advisory is still NULL, from their synopsis",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  limit: { type: "number", default: 50 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Backfill result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    checked: { type: "number" },
                    updated: { type: "number" },
                    errors: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
        },
      },
    },
    "/aliases": {
      post: {
        summary: "Backfill alternate titles for a title",
        description: "Update or add alternate titles for a title already in the catalog",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  titleId: { type: "string" },
                  aliases: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        alias: { type: "string" },
                        kind: { type: "string" },
                      },
                    },
                  },
                },
                required: ["titleId", "aliases"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Aliases updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    titleId: { type: "string" },
                    aliasCount: { type: "number" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
          "404": {
            description: "Title not found",
          },
        },
      },
    },
    "/cleanup/remove-invalid-tmdb": {
      post: {
        summary: "Remove invalid TMDB entries",
        description: "Clean up titles with mismatched or invalid TMDB IDs",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Cleanup complete",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    deleted: { type: "number" },
                    verified: { type: "number" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
          },
          "500": {
            description: "Server error",
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Bearer token authentication using INGEST_ADMIN_TOKEN",
      },
    },
  },
  tags: [
    {
      name: "Admin",
      description: "Admin-only endpoints (require INGEST_ADMIN_TOKEN)",
    },
  ],
};
