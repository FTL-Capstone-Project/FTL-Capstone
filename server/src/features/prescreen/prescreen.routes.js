// ── feature: prescreen · owner: David ──
// Extension check endpoints:
//   POST /api/prescreen       — INSTANT structural pre-check. Deterministic-only (no urlscan, no
//                               LLM), sub-second. Body: { sender?, urls?[] }. Takes only a sender
//                               address + link URLs, never the body — used for the click-guard.
//   POST /api/prescreen/demo  — public landing "try it" (URL only, no auth).
//   POST /api/prescreen/email — CONTENT-AWARE. Reads sender + subject + BODY via the LLM (same
//                               analysis as the forwarded-email pipeline) so a scam whose danger is
//                               in the words scores correctly. Slower + costs tokens; receives body
//                               text (capped, not stored). Powers the Gmail auto-scan badge.
// All return { level: safe|warning|dangerous, score, reasons[] }.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { prescreen } from "../../services/prescreen.js";
import { analyzeEmailBody, combineEmailReports } from "../webhooks/emailAnalysis.js";
import { generateSenderReport } from "../askOrbo/senderReport.js";
import { scoreBucket } from "../../services/verdict.js";
import { env } from "../../config/env.js";

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

// POST /api/prescreen/demo — the PUBLIC "try it" widget on the marketing landing page. No auth
// (a logged-out visitor uses it), so it's locked down hard:
//   • URL ONLY — no `sender`, so it never does the DNS lookup assessSender would (keeps it purely
//     in-memory + instant, and can't be turned into a DNS-probe / SSRF-ish tool for arbitrary hosts).
//   • Exactly ONE url per call, so it's a taste of the product, not a bulk scanner.
//   • IP-keyed rate limit (the limiter falls back to req.ip when there's no req.user; index.js sets
//     `trust proxy` so that IP is the real client behind Render's proxy). Deterministic-only means
//     no per-call cost — this cap guards against abuse/spam, not denial-of-wallet.
const demoLimit = rateLimit({ windowMs: 60_000, max: 15 });

prescreenRouter.post("/demo", demoLimit, async (req, res) => {
  const url = req.body?.url;
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "Paste a link to check." });
  }
  try {
    // Deliberately pass ONLY the url (no sender) so this stays in-memory + instant.
    const result = await prescreen({ urls: [url.trim()] });
    return res.json(result);
  } catch (e) {
    console.error("[prescreen:demo] failed:", e.message);
    return res.status(500).json({ error: "Couldn't check that just now." });
  }
});

// POST /api/prescreen/email — CONTENT-AWARE email check for the Gmail extension's auto-scan badge.
// Unlike /api/prescreen (instant, structural-only), this actually READS the message: it runs the
// same analysis the forwarded-email pipeline uses — the LLM reads the sender + subject + body for
// scam red flags, combined worst-of with the deterministic sender-trust report. That's what makes
// "open a known scam → it goes RED" work (the instant layer can't judge content, so it under-rated
// scams whose danger is in the words).
//
// Body: { sender?, subject?, body? } → { level, score, reasons[], title? }. Returns the SAME shape
// the badge already renders. Slower than the instant check (an LLM call, ~1-3s) and it costs model
// tokens, so it's rate-limited tighter. PRIVACY: this DOES receive the email's body text (that's
// the point — to read it); we cap the length and never store it here.
const emailLimit = rateLimit({ windowMs: 60_000, max: 30 });
// Map a 0-100 SAFETY score to the badge's 3 levels (mirror scoreBucket: >=70 safe, >=35 review).
const levelForScore = (score) => {
  const bucket = scoreBucket(score);
  return bucket === "safe" ? "safe" : bucket === "review" ? "warning" : "dangerous";
};

prescreenRouter.post("/email", requireAuth, emailLimit, async (req, res) => {
  const { sender, subject, body } = req.body ?? {};
  if ([sender, subject, body].every((v) => v == null || String(v).trim() === "")) {
    return res.status(400).json({ error: "Provide an email to check (sender, subject, and/or body)." });
  }
  // Without an LLM key we can't read content — tell the client so it can fall back to the instant
  // structural check rather than showing a broken/empty verdict.
  if (!env.llmApiKey) return res.status(503).json({ error: "Content analysis not configured" });

  try {
    // Two legs, same as the forwarded-email pipeline: sender trust + body red-flags, combined
    // worst-of. Each is best-effort (a failed leg is simply absent). No link-scan leg here — that's
    // the slow sandbox path; the click-guard + right-click handle links.
    const senderAddr = typeof sender === "string" ? sender.trim() : "";
    const [senderReport, bodyReport] = await Promise.all([
      senderAddr
        ? generateSenderReport({ email: senderAddr, context: subject || "" }).catch(() => null)
        : Promise.resolve(null),
      analyzeEmailBody({ from: senderAddr, subject: subject || "", body: body || "" }).catch(() => null),
    ]);

    // Nothing scorable (no key already handled; here means both legs returned null) → let the client
    // fall back to the instant check.
    if (!senderReport && !bodyReport) {
      return res.status(422).json({ error: "Couldn't analyze this email's content." });
    }

    const combined = combineEmailReports({ sender: senderReport, body: bodyReport, link: null });
    const score = combined.ai_score;
    return res.json({
      level: levelForScore(score),
      score,
      title: combined.title,
      reasons: Array.isArray(combined.evidence) ? combined.evidence.slice(0, 6) : [],
    });
  } catch (e) {
    console.error("[prescreen:email] failed:", e.message);
    return res.status(500).json({ error: "Couldn't check this email just now." });
  }
});
