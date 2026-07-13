// ── feature: history · owner: Ozias (personal ?mine=1) / analyst track (org-wide) ──
// GET /api/history?mine=1 — the caller's own reports (personal Reports page). §6.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
// import { requireAnalyst } from "../../middleware/requireAnalyst.js";
// import { prisma } from "../../db.js";

export const historyRouter = Router();

historyRouter.get("/", requireAuth, async (req, res) => {
  const mine = req.query.mine === "1";
  if (mine) {
    // TODO(Ozias): fetch submissions for req.user.id, join indicator verdict + org_review status.
    return res.json({ reports: [] }); // stub
  }
  // Org-wide (analyst) branch → analyst track; guard with requireAnalyst.
  // TODO(analyst): stats + recent for req.user.orgId.
  return res.json({ recent: [], stats: {} });
});
