// ── feature: campaigns · owner: David (Intelligence) · built by Ozias for G1·06 ──
// GET /api/campaigns — list the caller-org's campaigns for the analyst triage queue.
// Analyst-only (project_plan.md §7: 403 for non-analysts) and scoped to req.user.orgId.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnalyst } from "../../middleware/requireAnalyst.js";
import { prisma } from "../../db.js";
import { listCampaigns, getCampaignDetail } from "./campaigns.service.js";

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

// Parse + validate the :id path param. Returns the integer, or null if it isn't a positive
// whole number — so "/api/campaigns/abc" answers 400 instead of running a bogus query.
const parseCampaignId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/campaigns/:id — one campaign + the reports clustered under it (project_plan.md §6).
// Powers the CampaignDetail page the analyst reaches from a triage-queue campaign row.
// Analyst-only (requireAnalyst → 401/403) and org-scoped inside the service.
campaignsRouter.get("/:id", requireAuth, requireAnalyst, async (req, res) => {
  const campaignId = parseCampaignId(req.params.id);
  if (campaignId == null) return res.status(400).json({ error: "Bad campaign id" });

  try {
    const detail = await getCampaignDetail(prisma, { campaignId, orgId: req.user.orgId });
    // 404 (not 403) for another org's campaign: answering 403 would confirm the id exists
    // somewhere, which is exactly the leak story #12's isolation is meant to prevent.
    if (!detail) return res.status(404).json({ error: "Campaign not found" });
    return res.json(detail);
  } catch (e) {
    console.error("[campaigns] detail failed:", e.message);
    return res.status(500).json({ error: "Couldn't load that campaign just now." });
  }
});
