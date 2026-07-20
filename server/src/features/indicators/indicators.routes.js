// ── feature: indicators · owner: David ──
// GET /api/indicators/:id — the poll target. Returns the global indicator (from Postgres)
// merged with the caller's org_review (if any). §6.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { readIndicatorForClient, reportIndicator } from "./indicators.service.js";

export const indicatorsRouter = Router();

indicatorsRouter.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
  try {
    const indicator = await readIndicatorForClient(id, req.user);
    if (!indicator) return res.status(404).json({ error: "Not found" });
    return res.json(indicator);
  } catch (e) {
    console.error("[indicators] read failed:", e.message);
    return res.status(500).json({ error: "Couldn't load this check." });
  }
});

// POST /api/indicators/:id/report — "Report it" on the verdict card. Flags this global
// indicator's verdict for review (→ "pending review"), so it goes to the global security
// team queue. Any signed-in user can report; it never changes the AI verdict itself.
indicatorsRouter.post("/:id/report", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
  try {
    const result = await reportIndicator(id);
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (e) {
    console.error("[indicators] report failed:", e.message);
    return res.status(500).json({ error: "Couldn't submit your report just now." });
  }
});
