// ── feature: org · routes · owner: Michael ──
// POST /api/org/invite — an analyst (org admin) invites teammates by email. The Clerk invitation
// is created server-side (org.service.js) so the privileged Clerk org API + secret key never touch
// the browser, and the invite email is pointed back at the Orbis sign-in page. Body: { emails: [] }.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnalyst } from "../../middleware/requireAnalyst.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { inviteToOrg } from "./org.service.js";

export const orgRouter = Router();

// Inviting fires external Clerk calls (one per address) — cap per admin.
const limit = rateLimit({ windowMs: 60_000, max: 30 });
const MAX_EMAILS = 50; // sanity cap on a single batch

orgRouter.post("/invite", requireAuth, requireAnalyst, limit, async (req, res, next) => {
  const { emails } = req.body ?? {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: "Provide at least one email address." });
  }
  if (emails.length > MAX_EMAILS) {
    return res.status(400).json({ error: `Please invite at most ${MAX_EMAILS} people at a time.` });
  }
  if (!req.user.orgId) {
    // An analyst with no org shouldn't happen, but fail cleanly rather than 500 in the service.
    return res.status(400).json({ error: "You're not part of an organization yet." });
  }
  try {
    const result = await inviteToOrg({
      orgId: req.user.orgId,
      inviterId: req.user.clerkUserId,
      emails,
    });
    // 200 with a per-address breakdown: some may succeed while others were already members, etc.
    return res.json(result); // { invited: [], failed: [{ email, reason }] }
  } catch (err) {
    return next(err);
  }
});
