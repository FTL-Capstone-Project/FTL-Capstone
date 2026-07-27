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
import { analyzeEmailBody, combineEmailReports, combineLinkReports } from "../webhooks/emailAnalysis.js";
import { generateSenderReport } from "../askOrbo/senderReport.js";
import { scanLinkForReport } from "../indicators/indicators.service.js";
import { scoreBucket } from "../../services/verdict.js";
import { env } from "../../config/env.js";

export const prescreenRouter = Router();

// Resolve to `fallback` if `promise` hasn't settled within `ms`. Bounds how long the /email request
// can hold open while sandbox link scans run: a single hung/slow scan must never hang the whole
// request. The underlying scan keeps running (harmlessly) — we just stop waiting and score what we have.
const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise, new Promise((resolve) => { const t = setTimeout(() => resolve(fallback), ms); if (t.unref) t.unref(); })]);

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
// Unlike /api/prescreen (instant, structural-only), this actually READS the message and runs the
// SAME three legs the forwarded-email pipeline uses, combined by combineEmailReports:
//   1. SENDER   — generateSenderReport (LLM + deterministic domain/DNS backstop).
//   2. BODY     — analyzeEmailBody (LLM reads sender+subject+body for scam wording).
//   3. LINKS    — each link sandbox-scanned (urlscan + Safe Browsing) via scanLinkForReport, merged
//                 worst-of by combineLinkReports. This is the SLOW leg (a fresh scan is ~10-45s), so
//                 the badge waits (the extension shows a "deep-scanning" state) — the deliberate
//                 speed↔thoroughness tradeoff David chose: catch a benign-looking email hiding a
//                 malicious link, which sender+body alone can't.
// The combine is a RECONCILED worst-of (see reconcileLegScores), not a blind min: a DANGEROUS link
// leg (< 35) still dominates, so a hidden malicious link always turns the badge RED. But one
// marginal (65-69) leg — e.g. a benign ESP tracking link — no longer vetoes two clearly-safe legs,
// which is what keeps everyday marketing mail out of the warning band.
// That's what makes "open a scam → it goes RED" work whether the danger is in the WORDS or a LINK.
//
// Body: { sender?, subject?, body?, urls?[] } → { level, score, reasons[], title? }. Same shape the
// badge already renders. PRIVACY: receives the body text (to read it) + link URLs; both are capped
// and NEVER persisted here — unlike the forwarded-email pipeline, the auto-scan writes NO Indicator
// (opening an email must not flood Reports/analyst triage with every message you glance at).
const emailLimit = rateLimit({ windowMs: 60_000, max: 30 });
// Cap the links we sandbox-scan per email — mirrors MAX_EMAIL_LINKS in the forwarded-email path.
// Bounds both wall-clock (scans run in parallel, but more links = more chances for a slow one) and
// urlscan free-tier quota burn (every novel link is a fresh scan).
const MAX_SCAN_LINKS = 5;
// Overall budget for the (parallel) link-scan leg. A fresh urlscan is ~10-45s (75s hard cap in
// urlscan.js); we stop waiting at 60s and score sender+body + whatever links finished, so one
// hung scan can't hold the request open indefinitely.
const LINK_SCAN_BUDGET_MS = 60_000;
// Map a 0-100 SAFETY score to the badge's 3 levels (mirror scoreBucket: >=70 safe, >=35 review).
const levelForScore = (score) => {
  const bucket = scoreBucket(score);
  return bucket === "safe" ? "safe" : bucket === "review" ? "warning" : "dangerous";
};

prescreenRouter.post("/email", requireAuth, emailLimit, async (req, res) => {
  const { sender, subject, body, urls } = req.body ?? {};
  if ([sender, subject, body].every((v) => v == null || String(v).trim() === "")) {
    return res.status(400).json({ error: "Provide an email to check (sender, subject, and/or body)." });
  }
  // Without an LLM key we can't read content — tell the client so it can fall back to the instant
  // structural check rather than showing a broken/empty verdict.
  if (!env.llmApiKey) return res.status(503).json({ error: "Content analysis not configured" });

  // Clean the link list defensively (content-script input is untrusted): well-formed strings only,
  // deduped, capped. These get sandbox-scanned, so the cap matters for latency + quota.
  const cleanUrls = [...new Set(
    (Array.isArray(urls) ? urls : [])
      .filter((u) => typeof u === "string" && u.trim())
      .map((u) => u.trim())
  )].slice(0, MAX_SCAN_LINKS);

  try {
    // Three legs, same as the forwarded-email pipeline: sender trust + body red-flags + sandbox link
    // scans, reconciled by combineEmailReports. Each is best-effort (a failed leg is simply absent).
    const senderAddr = typeof sender === "string" ? sender.trim() : "";
    // The link leg can only sandbox-scan if urlscan is configured; skip the whole leg otherwise so a
    // missing key doesn't wait on 5 scans that will each throw. Bound the leg with an overall budget
    // so one slow scan can't hang the request; a link that doesn't finish in time is simply absent.
    const linkLeg = (env.urlscanApiKey && cleanUrls.length)
      ? withTimeout(
          Promise.all(cleanUrls.map((url) =>
            scanLinkForReport(url).then((report) => ({ url, report })).catch(() => ({ url, report: null }))
          )),
          LINK_SCAN_BUDGET_MS,
          [] // budget blown → treat the link leg as unavailable, score sender+body
        )
      : Promise.resolve([]);

    const [senderReport, bodyReport, linkScans] = await Promise.all([
      senderAddr
        ? generateSenderReport({ email: senderAddr, context: subject || "" }).catch(() => null)
        : Promise.resolve(null),
      analyzeEmailBody({ from: senderAddr, subject: subject || "", body: body || "" }).catch(() => null),
      linkLeg,
    ]);

    const link = combineLinkReports(linkScans); // one link leg from N scans (worst-of), or null

    // Nothing scorable (no key already handled; here means every leg returned null) → let the client
    // fall back to the instant check.
    if (!senderReport && !bodyReport && !link) {
      return res.status(422).json({ error: "Couldn't analyze this email's content." });
    }

    const combined = combineEmailReports({ sender: senderReport, body: bodyReport, link });
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
