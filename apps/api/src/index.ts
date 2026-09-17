import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./bindings.js";
import { searchRoute } from "./routes/search.js";
import { titlesRoute } from "./routes/titles.js";
import { collectionsRoute } from "./routes/collections.js";
import { feedbackRoute } from "./routes/feedback.js";
import { postersRoute } from "./routes/posters.js";
import { evalRunsRoute } from "./routes/eval-runs.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/healthz", (c) => c.json({ ok: true, service: "latino-canon-api" }));

app.route("/search", searchRoute);
app.route("/titles", titlesRoute);
app.route("/collections", collectionsRoute);
app.route("/feedback", feedbackRoute);
app.route("/posters", postersRoute);
app.route("/eval-runs", evalRunsRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default app;
