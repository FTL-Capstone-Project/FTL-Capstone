// ── feature: indicators · owner: David ──
// GET /api/indicators/:id — the poll target. Returns the global indicator (from Postgres)
// merged with the caller's org_review (if any). §6.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnalyst } from "../../middleware/requireAnalyst.js";
import { prisma } from "../../db.js";
import { readIndicatorForClient, reportIndicator, reviewIndicator, trustIndicator } from "./indicators.service.js";

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

  // Optional free-text "why". Cap at 200 WORDS (the modal enforces this too) so a huge blob can't
  // be posted, and reject an over-limit reason rather than silently truncating the user's words.
  let reason = req.body?.reason;
  if (reason != null) {
    if (typeof reason !== "string") return res.status(400).json({ error: "reason must be text" });
    reason = reason.trim();
    if (reason.split(/\s+/).filter(Boolean).length > 200) {
      return res.status(400).json({ error: "Please keep your reason under 200 words." });
    }
  }

  try {
    const result = await reportIndicator(id, { reason: reason || null, userId: req.user?.id ?? null });
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (e) {
    console.error("[indicators] report failed:", e.message);
    return res.status(500).json({ error: "Couldn't submit your report just now." });
  }
});

// POST /api/indicators/:id/trust — the community "Mark safe" vote on the verdict card. A user who
// checked this link and believes it's genuinely fine vouches for it. Any signed-in user may vote,
// ONCE (enforced by UserTrust's unique constraint, not by trusting the client).
//
// This never changes the AI verdict or score — it's a counter that flags a possible false positive.
// Voting twice is idempotent rather than an error, so a double-click or a stale button can't
// double-count and doesn't need to surface a failure to the user.
indicatorsRouter.post("/:id/trust", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });

  try {
    const result = await trustIndicator(id, { userId: req.user?.id ?? null });
    if (!result) return res.status(404).json({ error: "Not found" });
    // No resolvable user id (shouldn't happen behind requireAuth, but an anonymous vote can't be
    // deduped, so we refuse rather than accept a stuffable one).
    if (result.unauthenticated) return res.status(401).json({ error: "Sign in to vouch for a link." });
    return res.json(result);
  } catch (e) {
    console.error("[indicators] trust failed:", e.message);
    return res.status(500).json({ error: "Couldn't record your vote just now." });
  }
});

// ── closure loop (analyst review) · owner: Ozias ──
// PATCH /api/indicators/:id/review — an ANALYST records their org's authoritative verdict,
// overriding the AI. Guarded by requireAnalyst (its first real use): requireAuth sets
// req.user, then requireAnalyst rejects non-analysts with 403. On a confirmed verdict the
// service notifies the members who reported this link — that's the "closure loop" firing.
indicatorsRouter.patch("/:id/review", requireAuth, requireAnalyst, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });

  // An analyst only reviews on behalf of their own org (the OrgReview row is per-org).
  if (!req.user.orgId) return res.status(400).json({ error: "Analyst is not in an organization" });

  const { humanScore, humanVerdict, reviewStatus, sharedWithOrg } = req.body ?? {};
  try {
    const result = await reviewIndicator(prisma, {
      indicatorId: id,
      orgId: req.user.orgId,
      reviewedBy: req.user.id,
      humanScore,
      humanVerdict,
      reviewStatus,
      sharedWithOrg,
    });
    return res.json(result);
  } catch (e) {
    // A bad reviewStatus (or missing field) is the client's fault → 400, not 500.
    if (/invalid reviewStatus|is required/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    console.error("[indicators] review failed:", e.message);
    return res.status(500).json({ error: "Couldn't save this review just now." });
  }
});
