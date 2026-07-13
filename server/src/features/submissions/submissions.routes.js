// ── feature: submissions · owner: David ──
// POST /api/submissions — the core "check a link" entry point.
// Flow: canonicalize → find-or-create GLOBAL indicator → scan+blacklist+verdict → save.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { canonicalize } from "../../services/canonicalize.js";
import { createPending } from "./_devStore.js"; // ⚠️ dev-only; removed in Step 2 (Prisma)

export const submissionsRouter = Router();

submissionsRouter.post("/", requireAuth, async (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "A url is required" }); // → Invalid Input screen
  }

  // Validate the URL up front so bad input gets a friendly 400 (→ Invalid Input screen)
  // before we create anything. The store canonicalizes again internally for dedup.
  try {
    canonicalize(url);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a link or email address" });
  }

  // Find-or-create the GLOBAL indicator by canonicalKey. If we've seen this URL before,
  // reuse it (the "seen before" dedup + report_count bump); if new, the store kicks off the
  // real scan → blacklist → verdict pipeline in the background and the client polls for it.
  // (Still in-memory until Prisma lands — see _devStore.js.)
  const { id: indicatorId, seenBefore } = createPending(url);

  return res.status(201).json({ submissionId: indicatorId, indicatorId, status: "pending", seenBefore });
});
