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

  // Validate + normalize. Reject clearly-invalid input with a friendly 400.
  let canonicalKey;
  try {
    canonicalKey = canonicalize(url);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a link or email address" });
  }

  // STEP 1 (stub): create a pending indicator and let the client poll it.
  // STEP 2 (TODO David): find-or-create the GLOBAL indicator by canonicalKey — if it exists
  // and is done, return it instantly ("seen before"); else create it, kick off the real
  // scan → blacklist → Claude-verdict pipeline (services/*), and increment report_count.
  const indicatorId = createPending(url);

  return res.status(201).json({ submissionId: indicatorId, indicatorId, status: "pending" });
});
