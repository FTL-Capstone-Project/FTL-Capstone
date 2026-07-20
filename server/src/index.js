// ============================================================
// Orbis API — Express entry point.
//
// MIDDLEWARE ORDER MATTERS:
//   1. express.raw() for /api/webhooks/clerk ONLY — svix needs the raw body
//      to verify the signature, so it must run before express.json().
//   2. express.json() for everything else.
//   3. CORS (allow the Vite client).
//   4. clerkMiddleware() — attaches verified Clerk auth to every request
//      (does NOT block; requireAuth per-route enforces 401). Skipped when
//      Clerk keys are absent so the app still boots in dev-stub mode.
//   5. feature routers.
//   6. error handler (last).
// ============================================================
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { env, warnMissingEnv } from "./config/env.js";

import { submissionsRouter } from "./features/submissions/submissions.routes.js";
import { indicatorsRouter } from "./features/indicators/indicators.routes.js";
import { historyRouter } from "./features/history/history.routes.js";
import { dashboardRouter } from "./features/dashboard/dashboard.routes.js";
import { notificationsRouter } from "./features/notifications/notifications.routes.js";
import { webhooksRouter } from "./features/webhooks/webhooks.routes.js";
import { visionRouter } from "./features/vision/vision.routes.js";
import { askOrboRouter } from "./features/askOrbo/askOrbo.routes.js";
import { nlpQueryRouter } from "./features/nlpQuery/nlpQuery.routes.js";

warnMissingEnv();

export function createApp() {
  const app = express();

  // 1) RAW body for the Clerk webhook (svix signature verification needs it).
  app.use("/api/webhooks/clerk", express.raw({ type: "*/*" }));

  // 2) JSON for everything else. 12mb: uploaded screenshots arrive as base64 (vision feature).
  app.use(express.json({ limit: "12mb" }));

  // 3) CORS for the Vite client.
  app.use(
    cors({
      origin: env.clientUrl,
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // 4) Clerk auth context (real mode only; dev-stub skips it).
  if (env.clerkEnabled) {
    app.use(clerkMiddleware());
  }

  // Health check (public).
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, clerk: env.clerkEnabled ? "live" : "dev-stub" })
  );

  // 5) Feature routers.
  app.use("/api/submissions", submissionsRouter);
  app.use("/api/indicators", indicatorsRouter);
  app.use("/api/history", historyRouter);
  app.use("/api/dashboard", dashboardRouter);  // Michael: personal dashboard stats/charts
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/vision", visionRouter);        // David: screenshot read + image-upload extract
  app.use("/api/ask-orbo", askOrboRouter);     // David: interactive follow-up Q&A
  app.use("/api/nlp-query", nlpQueryRouter);   // David: AI Feature B (NL question → chart)

  // 6) Central error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error("[orbis] unhandled error:", err);
    res.status(err.status || 500).json({ error: err.message || "Internal error" });
  });

  return app;
}

// Only listen when run directly (not when imported by tests).
if (process.env.NODE_ENV !== "test") {
  createApp().listen(env.port, () =>
    console.log(`🪐 Orbis API on http://localhost:${env.port}  (auth: ${env.clerkEnabled ? "live Clerk" : "dev-stub"})`)
  );
}
