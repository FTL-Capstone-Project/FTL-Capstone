// ── feature: prescreen · owner: David ──
// POST /api/prescreen — the extension's INSTANT inline verdict. Deterministic-only (no urlscan,
// no LLM), so it returns in well under a second and can show a badge "before you interact".
// Body: { sender?, urls?: string[] } → { level: safe|warning|dangerous, score, reasons[] }.
//
// PRIVACY: this endpoint takes ONLY a sender address + link URLs — never the email body. The
// extension must send just those, so we never receive message content for the inline pre-check.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { prescreen } from "../../services/prescreen.js";

export const prescreenRouter = Router();

// This is cheap (no scan/model), but it auto-fires on every email/link, so still cap per user
// to keep a runaway content script from hammering the API. Higher than the scan limit since
// there's no per-call cost — this guards abuse, not denial-of-wallet.
const limit = rateLimit({ windowMs: 60_000, max: 120 });

prescreenRouter.post("/", requireAuth, limit, async (req, res) => {
  const { sender, urls } = req.body ?? {};
  if (sender != null && typeof sender !== "string") {
    return res.status(400).json({ error: "sender must be a string" });
  }
  if (urls != null && !Array.isArray(urls)) {
    return res.status(400).json({ error: "urls must be an array" });
  }
  if (!sender && (!Array.isArray(urls) || urls.length === 0)) {
    return res.status(400).json({ error: "Provide a sender and/or at least one url" });
  }
  // Keep only well-formed string URLs (defensive — content-script input is untrusted).
  const cleanUrls = (Array.isArray(urls) ? urls : [])
    .filter((u) => typeof u === "string" && u.trim())
    .map((u) => u.trim())
    .slice(0, 20);

  try {
    const result = await prescreen({ sender: sender?.trim() || undefined, urls: cleanUrls });
    return res.json(result);
  } catch (e) {
    console.error("[prescreen] failed:", e.message);
    return res.status(500).json({ error: "Couldn't pre-check that just now." });
  }
});
