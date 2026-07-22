// ── feature: webhooks · owner: Michael (clerk) / Ozias (inbound-email) ──
// POST /api/webhooks/clerk         — sync user/org mirror rows (svix-verified). §6
// POST /api/webhooks/inbound-email — Orbo-inbox → create a submission. §6 (Ozias)
//
// NOTE: the Clerk route needs the RAW request body for svix signature verification,
// so index.js mounts express.raw() for this path BEFORE the global express.json().
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { Webhook } from "svix";
import { prisma } from "../../db.js";
import { env } from "../../config/env.js";
import { mapClerkEvent } from "./clerkEvents.js";
import { applyClerkEvent, findUserByEmail, findUserByToken } from "../users/users.service.js";
import { submitEmail } from "../indicators/indicators.service.js";
import { createNotification } from "../notifications/notifications.service.js";
import { normalizeUrl } from "../../services/canonicalize.js";
import { extractEmailAddress, extractPlusToken, extractFirstUrl } from "./inboundEmail.js";

export const webhooksRouter = Router();

webhooksRouter.post("/clerk", async (req, res, next) => {
  try {
    if (!env.clerk.webhookSecret) {
      // Not configured yet — refuse rather than trusting unverified events.
      return res.status(503).json({ error: "Webhook secret not configured" });
    }

    // req.body is a Buffer here (express.raw). Verify the svix signature.
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
    const wh = new Webhook(env.clerk.webhookSecret);
    let event;
    try {
      event = wh.verify(payload, {
        "svix-id": req.header("svix-id"),
        "svix-timestamp": req.header("svix-timestamp"),
        "svix-signature": req.header("svix-signature"),
      });
    } catch {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const mapped = mapClerkEvent(event);
    const result = await applyClerkEvent(prisma, mapped);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return next(err);
  }
});

// Constant-time secret compare so an attacker can't time-probe the token byte by byte.
// timingSafeEqual throws on length mismatch, so guard length first (a mismatch is a mismatch).
const secretMatches = (provided, expected) => {
  if (typeof provided !== "string" || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// POST /api/webhooks/inbound-email — a Gmail + Apps Script relay (or a "simulate a forward" curl)
// POSTs a forwarded email as JSON: { from, to, subject, body }. We turn it into ONE reviewable
// email Indicator via submitEmail() — which analyzes sender + body + (any) link and enters the
// same Reports + analyst-triage + closure loop as a link check. Works even with NO link.
//
// This route has NO requireAuth — the shared x-orbis-token secret IS the auth. It must use async
// try/catch → next(err): Express 4 does NOT catch rejected promises from async handlers, so an
// un-caught throw would hang the request forever (see the /clerk handler above).
webhooksRouter.post("/inbound-email", async (req, res, next) => {
  try {
    // 1) Refuse until the shared secret is configured (mirrors /clerk's 503).
    if (!env.inboundEmail.token) {
      return res.status(503).json({ error: "Inbound email not configured" });
    }
    // 2) Verify the shared secret (header, not query — a query string leaks into access logs).
    if (!secretMatches(req.header("x-orbis-token"), env.inboundEmail.token)) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // 3) Parse the forwarded email. We need at least a from OR a to to identify the sender.
    const { from, to, subject, body } = req.body || {};
    if (typeof from !== "string" && typeof to !== "string") {
      return res.status(400).json({ error: "Missing from/to" });
    }

    // 4) Resolve the sender to a real user. Plus-token in `to` wins (it beats a spoofable From),
    //    else fall back to the From address. submitEmail needs the FULL row (id + orgId).
    const token = extractPlusToken(to);
    const user =
      (await findUserByToken(prisma, token)) ||
      (await findUserByEmail(prisma, extractEmailAddress(from)));

    // 5) Unknown sender → 202 "ignored", BEFORE any analysis. Keeps the endpoint from being abused
    //    as an open scanner and never reveals which addresses are registered.
    if (!user) {
      return res.status(202).json({ status: "ignored" });
    }

    // 6) Try to extract + validate a link. A missing/invalid link is NOT fatal anymore — a
    //    text-only scam still gets a sender+body verdict (link-less email).
    const found = extractFirstUrl(`${subject || ""} ${body || ""}`);
    let normalizedUrl = null;
    if (found) {
      try { normalizedUrl = normalizeUrl(found); } catch { normalizedUrl = null; }
    }

    // 7) One reviewable email Indicator (sender + body + optional link, analyzed in the background).
    const { submissionId, indicatorId, escalated } = await submitEmail({
      from,
      subject,
      body,
      hasLink: Boolean(normalizedUrl),
      rawUrl: normalizedUrl,
      user,
      contextText: subject ? String(subject).slice(0, 1000) : null,
    });

    // 8) Notify the sender on receipt. Best-effort: a notification failure must not fail intake.
    try {
      await createNotification(prisma, {
        userId: user.id,
        message: "We received your forwarded email and are checking the sender, message, and any links inside.",
        type: "email_received",
        indicatorId,
      });
    } catch (e) {
      console.warn("⚠ createNotification failed (non-fatal):", e.message);
    }

    // 9) Report intake success — we do NOT claim the verdict (analysis is fire-and-forget).
    return res.status(201).json({ submissionId, indicatorId, matched: true, escalated });
  } catch (err) {
    return next(err);
  }
});
