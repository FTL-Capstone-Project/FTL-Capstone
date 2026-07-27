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
import { getTeamSnapshot } from "./team.service.js";

export const dashboardRouter = Router();

// GET /api/dashboard — everything the page needs in one round-trip.
//
// Individuals get just their personal payload. A user in an org (member OR analyst)
// additionally gets a `team` block of org-wide situational awareness — attached only
// when orgId is present, so an individual's response shape is unchanged. Analysts have
// their own richer dashboard, but attaching `team` here is harmless (they don't read it).
dashboardRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const data = await getDashboard(req.user.id);
    // Members see personal stats + team awareness. getTeamSnapshot returns null for
    // individuals (no orgId), so we only add the key when there's a team to show.
    const team = await getTeamSnapshot(req.user.orgId);
    if (team) data.team = team;
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});
