// ── feature: submissions · owner: David ──
// POST /api/submissions — the core "check a link" entry point.
// Flow: canonicalize → find-or-create GLOBAL indicator → scan+blacklist+verdict → save.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { canonicalize } from "../../services/canonicalize.js";
import { scanUrl } from "../../services/urlscan.js";
import { checkBlacklist } from "../../services/safeBrowsing.js";
import { generateVerdict } from "../../services/verdict.js";
// import { prisma } from "../../db.js"; // TODO(David): enable once schema is migrated

export const submissionsRouter = Router();

submissionsRouter.post("/", requireAuth, async (req, res) => {
  const { url, contextText } = req.body ?? {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A url is required" }); // → Invalid Input screen
  }

  let canonicalKey;
  try {
    canonicalKey = canonicalize(url);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a valid link" });
  }

  // TODO(David): find-or-create indicator by canonicalKey; if found+done → return instantly
  // (this is the "seen before" dedup). If new → run the pipeline below and persist.
  const scan = await scanUrl(url);
  const bl = await checkBlacklist(url);
  const verdict = await generateVerdict({
    evidence: scan.evidence,
    blacklist_hit: bl.blacklist_hit,
    domain_age_days: scan.domain_age_days,
    contextText,
  });

  // Stub response shape (matches §6). Replace with real DB ids once Prisma is wired.
  return res.status(201).json({
    submissionId: 1,
    indicatorId: 1,
    status: "done",
    _debug: { canonicalKey, ...scan, ...bl, ...verdict },
  });
});
