// ── feature: indicators · owner: David ──
// GET /api/indicators/:id — the poll target. Returns the global indicator merged
// with the caller's org_review (if any). §6.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { readIndicator } from "../submissions/_devStore.js"; // ⚠️ dev-only; removed in Step 2
// import { prisma } from "../../db.js";

export const indicatorsRouter = Router();

indicatorsRouter.get("/:id", requireAuth, async (req, res) => {
  // STEP 1 (stub): read the in-memory indicator; advances pending → scanning → done over ~2s.
  // STEP 2 (TODO David): load the real global indicator by id, merge the caller-org's org_review,
  // 404 if missing / 403 if out of scope.
  const indicator = readIndicator(Number(req.params.id));
  if (!indicator) return res.status(404).json({ error: "Not found" });
  return res.json(indicator);
});
