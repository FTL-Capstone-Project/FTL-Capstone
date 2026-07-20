// ── feature: submissions · owner: David ──
// POST /api/submissions — the core "check a link" entry point.
// Flow: validate → submitUrl() [find-or-create GLOBAL indicator in Postgres, record the
// submission, dedup by canonicalKey] → background scan+blacklist+verdict → client polls.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { normalizeUrl } from "../../services/canonicalize.js";
import { submitUrl } from "../indicators/indicators.service.js";

export const submissionsRouter = Router();

// Each submission fires a urlscan scan + Safe Browsing + Claude verdict — cap per user
// so unique-URL loops can't drain the quota/budget (denial-of-wallet).
const limit = rateLimit({ windowMs: 60_000, max: 20 });
const MAX_CONTEXT = 1000; // cap free-text context (also blunts prompt-injection payloads)

submissionsRouter.post("/", requireAuth, limit, async (req, res) => {
  const { url, contextText } = req.body ?? {};
  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "A url is required" }); // → Invalid Input screen
  }
  if (contextText != null && (typeof contextText !== "string" || contextText.length > MAX_CONTEXT)) {
    return res.status(400).json({ error: "That note is too long — keep it under 1000 characters." });
  }

  // Validate + normalize up front. normalizeUrl prepends "https://" to a bare domain
  // ("amzon.com") so the parser, the dedup key, storage, and the urlscan submit all agree,
  // and rejects a bare email (that belongs to the sender-report path, not the scanner).
  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(url);
  } catch (e) {
    // BLOCKED_URL = a real-looking URL we refuse (non-web scheme, or internal/private host);
    // INVALID_URL = not a link at all. Give the more specific message for the former.
    if (e.message === "BLOCKED_URL") {
      return res.status(400).json({ error: "I can only check public web links (http/https) — not internal, local, or non-web addresses." });
    }
    return res.status(400).json({ error: "That doesn't look like a link or email address" });
  }

  try {
    const { indicatorId, submissionId, seenBefore } = await submitUrl({
      rawUrl: normalizedUrl,
      user: req.user,
      contextText: typeof contextText === "string" ? contextText : null,
    });
    // Always return pending — the client polls GET /indicators/:id; a seen-before
    // indicator that's already "done" resolves on the first poll.
    return res.status(201).json({ submissionId, indicatorId, status: "pending", seenBefore });
  } catch (e) {
    console.error("[submissions] failed:", e.message);
    return res.status(500).json({ error: "Couldn't start the check. Please try again." });
  }
});
