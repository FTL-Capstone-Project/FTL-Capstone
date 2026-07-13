// ============================================================
// Orbis API — Express entry point.
// MIDDLEWARE ORDER MATTERS: express.json() must come BEFORE routes
// so req.body is parsed. (Clerk auth is applied per-route via requireAuth.)
// ============================================================
import express from "express";
import { env, warnMissingEnv } from "./config/env.js";

import { submissionsRouter } from "./features/submissions/submissions.routes.js";
import { indicatorsRouter } from "./features/indicators/indicators.routes.js";
import { historyRouter } from "./features/history/history.routes.js";
import { notificationsRouter } from "./features/notifications/notifications.routes.js";
import { webhooksRouter } from "./features/webhooks/webhooks.routes.js";

warnMissingEnv();

const app = express();
app.use(express.json()); // 1) parse JSON bodies FIRST

// simple CORS for local dev (client on :5173 → server on :3001)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// 2) mount feature routers
app.use("/api/submissions", submissionsRouter);
app.use("/api/indicators", indicatorsRouter);
app.use("/api/history", historyRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/webhooks", webhooksRouter);

app.listen(env.port, () => console.log(`🪐 Orbis API on http://localhost:${env.port}`));
