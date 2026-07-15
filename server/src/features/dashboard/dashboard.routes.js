// ── feature: dashboard · owner: Michael ──
// GET /api/dashboard — the PERSONAL dashboard payload (stats, charts, recent, activity).
//
// Flow: Dashboard.jsx → api.get("/api/dashboard") → HERE → getDashboard(userId)
// → Prisma → Postgres → back. requireAuth (Michael's middleware) puts the verified
// user on req.user, so we only ever compute THAT user's data (story #12 isolation).
//
// Personal-only for now: individuals have no org/analyst layer, so there is no
// role branching here yet. The Org/Analyst dashboard variants are a later slice.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getDashboard } from "./dashboard.service.js";

export const dashboardRouter = Router();

// GET /api/dashboard — everything the page needs in one round-trip.
dashboardRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const data = await getDashboard(req.user.id);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});
