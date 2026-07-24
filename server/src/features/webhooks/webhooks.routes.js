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
import { extractEmailAddress, extractPlusToken, extractAllUrls } from "./inboundEmail.js";

export const webhooksRouter = Router();

// A forwarded email can carry many links; scan them all, but bound the fan-out — each link is a
// slow urlscan sandbox call and the free tier is rate-limited. If an email has more than this, we
// scan the first few and log that we truncated (never a SILENT cap — that would read as "all
// links were clean" when we simply didn't look).
const MAX_EMAIL_LINKS = 5;

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

// Extract + normalize + dedup EVERY link in the email (subject + body), capped at MAX_EMAIL_LINKS.
// A scam often hides the malicious link among safe ones, so we scan all (not just the first); a
// missing/invalid link is NOT fatal (a text-only scam still gets a sender+body verdict). Pure-ish.
const extractEmailLinks = (subject, body) => {
  const candidates = extractAllUrls(`${subject || ""} ${body || ""}`);
  const seen = new Set();
  const rawUrls = [];
  for (const candidate of candidates) {
    let normalized;
    try { normalized = normalizeUrl(candidate); } catch { continue; } // drops bad/internal hosts
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rawUrls.push(normalized);
    if (rawUrls.length >= MAX_EMAIL_LINKS) {
      if (seen.size < candidates.length) {
        console.warn(`⚠ inbound-email: capping link scan at ${MAX_EMAIL_LINKS} (more links were present)`);
      }
      break;
    }
  }
  return rawUrls;
};

// Turn ONE forwarded-email payload into a reviewable email Indicator: resolve the sender to a real
// user, extract its links, kick the background analysis via submitEmail(), and fire the on-receipt
// notification. Shared by the single-email route AND the batch route so their behavior can't drift.
// NEVER throws — returns a tagged result the caller maps to a status/entry:
//   { status: "ignored" }                                   — unknown sender (not a registered user)
//   { status: "bad_request" }                               — no from/to to identify a sender
//   { status: "ok", submissionId, indicatorId, escalated }  — accepted (verdict fills in async)
// The forwarded email's OWN fields are the only inputs; identical logic to the pre-batch route.
const intakeForwardedEmail = async ({ from, to, subject, body, html, headers, replyTo, threadId }) => {
  // Need at least a from OR a to to identify the sender.
  if (typeof from !== "string" && typeof to !== "string") return { status: "bad_request" };

  // Resolve the sender to a real user. Plus-token in `to` wins (it beats a spoofable From), else the
  // From address. Unknown sender → "ignored": keeps the endpoint from being abused as an open scanner
  // and never reveals which addresses are registered.
  const token = extractPlusToken(to);
  const user =
    (await findUserByToken(prisma, token)) ||
    (await findUserByEmail(prisma, extractEmailAddress(from)));
  if (!user) return { status: "ignored" };

  const rawUrls = extractEmailLinks(subject, body);

  // One reviewable email Indicator (sender + body + every link, analyzed in the background). Pass
  // rawUrls (all) AND rawUrl (first, for back-compat with the single-link shape).
  const { submissionId, indicatorId, escalated } = await submitEmail({
    from, subject, body, html, headers, replyTo, threadId,
    hasLink: rawUrls.length > 0,
    rawUrl: rawUrls[0] ?? null,
    rawUrls,
    user,
    contextText: subject ? String(subject).slice(0, 1000) : null,
  });

  // Notify the sender on receipt. Best-effort: a notification failure must not fail intake.
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

  return { status: "ok", submissionId, indicatorId, escalated };
};

// Run `worker` over `items` with at most `limit` in flight at once. Bounded concurrency is the whole
// point of the batch endpoint: fully serial wastes wall-clock (each email waits on the previous
// email's urlscan+LLM chain), but unbounded parallelism would hammer the urlscan free tier + the LLM
// rate limit and could exhaust the DB pool. This keeps a steady `limit` in flight. Results preserve
// input order. A worker that throws is caught and its slot recorded as an error (never sinks the batch).
const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const runOne = async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = { status: "error", error: e.message }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
};

// How many forwarded emails a single batch request may carry, and how many we analyze concurrently.
// MAX keeps one request bounded (the relay pages beyond this); CONCURRENCY is tuned below the urlscan
// free-tier + LLM rate limits so a full batch can't trip them. Both are visible knobs, not magic.
const MAX_BATCH_EMAILS = 50;
const BATCH_CONCURRENCY = 4;

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

    // 3) One forwarded email → one reviewable Indicator (analysis is fire-and-forget). html/headers/
    //    replyTo/threadId are OPTIONAL richer fields (SPF/DKIM/DMARC, anchor-vs-href, thread reply);
    //    a plain-text relay that omits them still works.
    const result = await intakeForwardedEmail(req.body || {});
    if (result.status === "bad_request") return res.status(400).json({ error: "Missing from/to" });
    if (result.status === "ignored") return res.status(202).json({ status: "ignored" });
    // Accepted — we do NOT claim the verdict (analysis is fire-and-forget).
    return res.status(201).json({ submissionId: result.submissionId, indicatorId: result.indicatorId, matched: true, escalated: result.escalated });
  } catch (err) {
    return next(err);
  }
});

// POST /api/webhooks/inbound-email/batch — the SCALE path (Somal's feedback: "you're sending one
// request per email… when you scale this might be a bottleneck"). Accepts MANY forwarded emails in
// ONE request — { emails: [ {from,to,subject,body,html?,headers?,replyTo?,threadId?}, … ] } — so the
// relay makes one HTTP call per poll instead of one per email. We analyze them with BOUNDED
// concurrency (BATCH_CONCURRENCY at a time) so a burst can't overrun the urlscan free tier / LLM
// rate limit / DB pool. Same x-orbis-token auth. Per-email results are returned IN ORDER so the relay
// knows exactly which forwards were accepted / ignored / errored (never a silent drop). Each email is
// independent: one bad email doesn't fail the batch. Fully back-compatible — the single-email route
// above is unchanged, so an un-upgraded relay keeps working.
webhooksRouter.post("/inbound-email/batch", async (req, res, next) => {
  try {
    if (!env.inboundEmail.token) {
      return res.status(503).json({ error: "Inbound email not configured" });
    }
    if (!secretMatches(req.header("x-orbis-token"), env.inboundEmail.token)) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const emails = Array.isArray(req.body?.emails) ? req.body.emails : null;
    if (!emails) return res.status(400).json({ error: "Expected { emails: [...] }" });
    if (emails.length === 0) return res.status(200).json({ accepted: 0, ignored: 0, errored: 0, results: [] });
    // Never silently truncate: if the relay over-sends, tell it exactly how many we processed so it
    // re-queues the rest (mirrors the single-link cap's "no silent cap" rule).
    const overflow = emails.length > MAX_BATCH_EMAILS;
    const batch = overflow ? emails.slice(0, MAX_BATCH_EMAILS) : emails;
    if (overflow) console.warn(`⚠ inbound-email batch: capping at ${MAX_BATCH_EMAILS} (received ${emails.length}); relay should re-send the rest`);

    const results = await mapWithConcurrency(batch, BATCH_CONCURRENCY, (email) => intakeForwardedEmail(email || {}));

    // Summarize per-email outcomes so the relay can act (label sent / retry errored). Order matches input.
    const accepted = results.filter((r) => r.status === "ok").length;
    const ignored = results.filter((r) => r.status === "ignored" || r.status === "bad_request").length;
    const errored = results.filter((r) => r.status === "error").length;
    // 200, not 201: a batch has MIXED outcomes (some created, some ignored, some errored) — there's no
    // single created resource to point a 201 at. The per-email `results` array carries each item's own
    // status (ok/ignored/bad_request/error), so this is a successful "here's what happened to each" reply.
    return res.status(200).json({
      accepted, ignored, errored,
      processed: batch.length,
      received: emails.length,
      results: results.map((r) => ({
        status: r.status,
        ...(r.indicatorId ? { indicatorId: r.indicatorId, submissionId: r.submissionId, escalated: r.escalated } : {}),
      })),
    });
  } catch (err) {
    return next(err);
  }
});
