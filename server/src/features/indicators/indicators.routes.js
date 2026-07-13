// ── feature: indicators · owner: David ──
// GET /api/indicators/:id — the poll target. Returns the global indicator merged
// with the caller's org_review (if any). §6.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
// import { prisma } from "../../db.js";

export const indicatorsRouter = Router();

indicatorsRouter.get("/:id", requireAuth, async (req, res) => {
  // TODO(David): load indicator by id; merge caller-org's org_review; 404 if missing.
  // Stub "done" verdict so the client's poll + VerdictCard render end-to-end.
  return res.json({
    status: "done",
    ai_score: 88,
    ai_verdict: "This link looks dangerous — the domain is brand new and it asks for your password. I'd recommend not clicking it.",
    ai_confidence: "medium",
    screenshot_url: null,
    report_count: 3,
    evidence: [
      { text: "Domain registered 3 days ago", severity: "dangerous" },
      { text: "Page asks for your password", severity: "dangerous" },
    ],
    review: null, // { human_score, human_verdict, review_status } when the caller's org reviewed it
  });
});
