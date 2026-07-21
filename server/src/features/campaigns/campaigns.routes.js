// ── feature: campaigns · owner: David (Intelligence) · built by Ozias for G1·06 ──
// GET /api/campaigns — list the caller-org's campaigns for the analyst triage queue.
// Analyst-only (project_plan.md §7: 403 for non-analysts) and scoped to req.user.orgId.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnalyst } from "../../middleware/requireAnalyst.js";
import { prisma } from "../../db.js";
import { listCampaigns } from "./campaigns.service.js";

export const campaignsRouter = Router();

campaignsRouter.get("/", requireAuth, requireAnalyst, async (req, res) => {
  try {
    const campaigns = await listCampaigns(prisma, req.user.orgId);
    return res.json({ campaigns });
  } catch (e) {
    console.error("[campaigns] list failed:", e.message);
    return res.status(500).json({ error: "Couldn't load campaigns just now." });
  }
});
