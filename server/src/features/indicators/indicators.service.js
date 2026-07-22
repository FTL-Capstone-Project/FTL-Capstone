// ============================================================
// Indicator data layer (Prisma / Postgres) — the real persistence for check-link.
// GLOBAL indicators are deduped by canonicalKey and scanned ONCE, shared by everyone.
//
// submitUrl(): find-or-create the indicator + write the submission, kick off the
//   real scan→blacklist→verdict pipeline in the background (client polls for it).
// readIndicatorForClient(): shape one indicator (+ caller's org_review) for GET /:id.
//
// NOTE: title/description/tags are DERIVED on read for now — the Indicator table
// doesn't have columns for them yet (Michael is adding aiTitle/aiDescription/aiTags).
// Once those land, store + read them directly (see TODO markers).
// Owner: David.
// ============================================================
import { prisma } from "../../db.js";
import { canonicalize } from "../../services/canonicalize.js";
import { scanUrl } from "../../services/urlscan.js";
import { checkBlacklist } from "../../services/safeBrowsing.js";
import { generateVerdict, scoreBucket } from "../../services/verdict.js";
import { registeredDomain } from "../../services/typosquat.js";
import { escalateSubmission } from "../submissions/submissions.service.js";
import { createNotification } from "../notifications/notifications.service.js";

// In dev-stub auth mode, req.user is a fake { id: 1, ... } that may not exist in the DB,
// so a submission FK would fail. Resolve a REAL mirror row for it (upsert by a stable
// clerkUserId) and use that id. In real Clerk mode, req.user.id is already a real row.
const resolveUserId = async (user) => {
  if (user?.clerkUserId === "user_devstub" || user?.id == null) {
    const row = await prisma.user.upsert({
      where: { clerkUserId: user?.clerkUserId || "user_devstub" },
      update: {},
      create: {
        clerkUserId: user?.clerkUserId || "user_devstub",
        email: user?.email || "dev@orbis.local",
        name: user?.name || "Dev User",
        role: "individual",
        orgId: null,
      },
    });
    return { id: row.id, orgId: row.orgId };
  }
  return { id: user.id, orgId: user.orgId ?? null };
}

// Submit a URL: dedup by canonicalKey, record the submission, run the pipeline if new.
// Returns { indicatorId, submissionId, status, seenBefore }.
export const submitUrl = async ({ rawUrl, user, contextText = null, source = "web" }) => {
  let canonicalKey;
  try { canonicalKey = canonicalize(rawUrl); } catch { canonicalKey = rawUrl.trim().toLowerCase(); }
  const domain = safeDomain(rawUrl, canonicalKey);

  // Find-or-create the GLOBAL indicator (dedup). New rows start "pending".
  let indicator = await prisma.indicator.findUnique({ where: { canonicalKey } });
  const seenBefore = Boolean(indicator);
  if (!indicator) {
    indicator = await prisma.indicator.create({
      data: { canonicalKey, domain, status: "pending", reportCount: 0 },
    });
  }

  // Resolve a real user row (handles the dev-stub fake id) so the FK holds.
  const { id: userId, orgId } = await resolveUserId(user);

  // Record the submission (who reported it) + bump the shared report counter.
  const [submission] = await prisma.$transaction([
    prisma.submission.create({
      data: {
        userId,
        orgId,
        indicatorId: indicator.id,
        rawUrl,
        contextText,
        source,
      },
    }),
    prisma.indicator.update({
      where: { id: indicator.id },
      data: { reportCount: { increment: 1 } },
    }),
  ]);

  // Auto-escalate org-member submissions to their analyst (O9 seam — Ozias's helper).
  // Individuals (orgId null) have no analyst, so they're never escalated.
  let escalated = false;
  if (orgId != null) {
    try {
      await escalateSubmission(prisma, { submissionId: submission.id, orgId, indicatorId: indicator.id });
      escalated = true;
    } catch (e) {
      console.warn("⚠ escalateSubmission failed (non-fatal):", e.message);
    }
  }

  // Run the pipeline for a NEW indicator, OR re-kick a stale one (stuck pending/error from
  // a prior crash). A "done"/"scanning" indicator is left alone — that's the dedup win.
  const needsScan = !seenBefore || indicator.status === "pending" || indicator.status === "error";
  if (needsScan) runPipeline(indicator.id, rawUrl, contextText);

  return { indicatorId: indicator.id, submissionId: submission.id, status: indicator.status, seenBefore, escalated };
}

// Persist a SENDER report so it shows up in Reports/History like a link check does. A sender
// report is computed synchronously by generateSenderReport() (no sandbox to poll), so unlike a
// URL we store the finished verdict directly as a "done" Indicator + a Submission — reusing the
// SAME two tables/dedup as links, so the Reports page needs zero changes. Deduped by a
// "sender:<email>" canonicalKey so re-checking the same sender bumps reportCount instead of
// creating a duplicate indicator (mirrors the URL dedup win). Best-effort: if this write fails,
// the caller still returns the report to the user — persistence is additive, not load-bearing.
// @param {{ email, report, user, contextText? }}  report = the object from generateSenderReport()
// @returns {Promise<number|null>} the indicator id (for the client), or null on failure
export const persistSenderReport = async ({ email, report, user, contextText = null }) => {
  const addr = String(email).trim().toLowerCase();
  const canonicalKey = `sender:${addr}`;                 // distinct namespace from URL keys
  const at = addr.lastIndexOf("@");
  const domain = at >= 0 ? (registeredDomain(addr.slice(at + 1)) || addr.slice(at + 1)) : addr;

  try {
    // Find-or-create the GLOBAL indicator for this sender, then write the finished verdict onto
    // it (a sender report has no async phase, so it lands "done" immediately).
    let indicator = await prisma.indicator.findUnique({ where: { canonicalKey } });
    const seenBefore = Boolean(indicator);
    const verdictData = {
      status: "done",
      aiScore: report.ai_score,
      aiVerdict: report.ai_verdict,
      aiConfidence: report.ai_confidence,
      aiTitle: report.title ?? null,
      aiTags: report.tags ?? [],
      // report.evidence is [{text,severity}] — same shape the Reports card reads as aiReasons.
      aiReasons: report.evidence ?? [],
    };
    if (!indicator) {
      indicator = await prisma.indicator.create({ data: { canonicalKey, domain, reportCount: 0, ...verdictData } });
    } else {
      // Re-check of a known sender → refresh the verdict (it's deterministic-backstopped anyway).
      indicator = await prisma.indicator.update({ where: { id: indicator.id }, data: verdictData });
    }

    const { id: userId, orgId } = await resolveUserId(user);
    const [submission] = await prisma.$transaction([
      prisma.submission.create({
        data: { userId, orgId, indicatorId: indicator.id, rawUrl: addr, contextText, source: "email" },
      }),
      prisma.indicator.update({ where: { id: indicator.id }, data: { reportCount: { increment: 1 } } }),
    ]);

    // Same analyst auto-escalation as links, so org-member sender reports also enter the queue.
    if (orgId != null) {
      try { await escalateSubmission(prisma, { submissionId: submission.id, orgId, indicatorId: indicator.id }); }
      catch (e) { console.warn("⚠ escalateSubmission (sender) failed (non-fatal):", e.message); }
    }
    return indicator.id;
  } catch (e) {
    console.warn("⚠ persistSenderReport failed (non-fatal):", e.message);
    return null;
  }
}

// The real pipeline: scanning → urlscan + Safe Browsing → verdict → done. Writes each phase.
const runPipeline = async (indicatorId, rawUrl, contextText) => {
  try {
    await prisma.indicator.update({ where: { id: indicatorId }, data: { status: "scanning" } });

    const [scan, bl] = await Promise.all([scanUrl(rawUrl), checkBlacklist(rawUrl)]);
    const verdict = await generateVerdict({
      evidence: scan.evidence,
      blacklist_hit: bl.blacklist_hit,
      blacklist_source: bl.blacklist_source,
      domain_age_days: scan.domain_age_days,
      raw: scan._raw ?? {},
      contextText,
      rawUrl, // lets the verdict flag raw-IP-host / unusual-port shape signals
    });

    await prisma.indicator.update({
      where: { id: indicatorId },
      data: {
        status: "done",
        aiScore: verdict.ai_score,
        aiVerdict: verdict.ai_verdict,
        aiConfidence: verdict.ai_confidence,
        screenshotUrl: scan.screenshot_url ?? null,
        urlscanUuid: scan.urlscan_uuid ?? null,
        // Redirect facts (step 2): where the link truly lands, so the verdict + chat never guess.
        finalUrl: scan.final_url ?? null,
        finalHost: scan.final_host ?? null,
        redirectedToDifferentHost: scan.redirected_to_different_host ?? false,
        domainAgeDays: scan.domain_age_days ?? null,
        blacklistHit: bl.blacklist_hit,
        blacklistSource: bl.blacklist_source ?? null,
        // Reports-card fields (now real columns): headline, summary, tag chips, "why" rows.
        aiTitle: verdict.title ?? null,
        aiDescription: verdict.description ?? null,
        aiTags: verdict.tags ?? [],
        aiReasons: verdict.evidence_summary ?? [],
      },
    });
  } catch (e) {
    console.warn(`⚠ pipeline failed for indicator ${indicatorId}:`, e.message);
    await prisma.indicator.update({
      where: { id: indicatorId },
      data: { status: "error", aiVerdict: errorMessage(e.reason) },
    }).catch(() => {});
  }
}

// Prisma Json comes back parsed; guard against null/non-array from older rows.
// Defined above its first use below because arrow consts are not hoisted.
const asArray = (v) => (Array.isArray(v) ? v : null);

// Shape one indicator for the client poll (GET /api/indicators/:id), merging the
// caller's org_review if any. Field names match what the client + Reports card expect.
export const readIndicatorForClient = async (indicatorId, user) => {
  const indicator = await prisma.indicator.findUnique({ where: { id: indicatorId } });
  if (!indicator) return null;

  // The caller-org's private review (analyst verdict / closure status), if it exists.
  let review = null;
  if (user?.orgId != null) {
    const r = await prisma.orgReview.findUnique({
      where: { orgId_indicatorId: { orgId: user.orgId, indicatorId } },
    });
    if (r) review = { human_score: r.humanScore, human_verdict: r.humanVerdict, review_status: r.reviewStatus };
  }

  // IDOR guard (SEC-MED): indicators are GLOBAL threat-intel, so the verdict/score/tags are
  // shared with everyone (that's the "seen before" value). BUT the caller-specific detail —
  // the exact landing URL, its host, and the page screenshot — can leak a private/internal
  // link someone else pasted (intranet hosts, reset tokens). So we only return those when the
  // caller (or their org) actually submitted this indicator. Everyone else gets the aggregate
  // verdict without the sensitive destination fields.
  const submittedByCaller = await prisma.submission.findFirst({
    where: {
      indicatorId,
      OR: [
        ...(user?.id != null ? [{ userId: user.id }] : []),
        ...(user?.orgId != null ? [{ orgId: user.orgId }] : []),
      ],
    },
    select: { id: true },
  });
  const ownsDetail = Boolean(submittedByCaller);

  const base = {
    status: indicator.status,
    // withhold the screenshot from non-submitters (it's a picture of someone else's link)
    screenshot_url: ownsDetail ? indicator.screenshotUrl : null,
    review,
  };
  if (indicator.status === "error") {
    return { ...base, ai_verdict: indicator.aiVerdict || errorMessage() };
  }
  if (indicator.status !== "done") return base; // pending / scanning → no verdict yet

  const bucket = scoreBucket(indicator.aiScore);
  return {
    ...base,
    ai_score: indicator.aiScore,
    ai_verdict: indicator.aiVerdict,
    ai_confidence: indicator.aiConfidence,
    report_count: indicator.reportCount,
    // Real stored fields now (fall back to derived only for older rows scanned pre-migration).
    title: indicator.aiTitle || deriveTitle(indicator, bucket),
    description: indicator.aiDescription || firstSentence(indicator.aiVerdict),
    tags: asArray(indicator.aiTags) ?? deriveTags(indicator, bucket),
    evidence: asArray(indicator.aiReasons) ?? [],
    domain: indicator.domain,
    // Landing URL + host: caller-sensitive (can be an internal hostname/token) → submitters only.
    // The boolean "did it leave the domain" is safe to share (no hostname leak).
    final_url: ownsDetail ? indicator.finalUrl : null,
    final_host: ownsDetail ? indicator.finalHost : null,
    redirected_to_different_host: indicator.redirectedToDifferentHost,
    // "Report it" → global review flow: lets the card show an "under review" banner.
    global_review_status: indicator.globalReviewStatus,
    reported_count: indicator.reportedCount,
  };
}

// "Report it": a user flags this global indicator's verdict for review by the (portrayed)
// global security team. Sets it to "pending review" if it isn't already resolved, and bumps
// the reported counter. Because the indicator is GLOBAL, one user's report is visible to all
// as "under review" — but it NEVER changes aiScore/the verdict (a report is a request for a
// human look, not a re-scoring). Returns the updated review status + count.
export const reportIndicator = async (indicatorId, { reason = null, userId = null } = {}) => {
  const i = await prisma.indicator.findUnique({ where: { id: indicatorId } });
  if (!i) return null;
  // Don't reopen something a reviewer already confirmed; just count the extra report.
  const alreadyResolved = i.globalReviewStatus === "confirmed safe" || i.globalReviewStatus === "confirmed dangerous";

  // Store the user's free-text WHY alongside the count bump (best-effort — a failed reason write
  // must not lose the report itself). The route already caps length; trim defensively here too.
  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 1400) : null;

  const [updated] = await prisma.$transaction([
    prisma.indicator.update({
      where: { id: indicatorId },
      data: {
        reportedCount: { increment: 1 },
        ...(alreadyResolved ? {} : { globalReviewStatus: "pending review" }),
      },
    }),
    ...(cleanReason ? [prisma.reportReason.create({ data: { indicatorId, userId, reason: cleanReason } })] : []),
  ]);

  return { global_review_status: updated.globalReviewStatus, reported_count: updated.reportedCount };
};

// ── closure loop (analyst review) · owner: Ozias ──
// The four review states an analyst may set (must match the OrgReview.reviewStatus
// values in schema.prisma AND the StatusChip keys the client renders). Anything else
// is rejected so we never write a status the UI can't display.
export const REVIEW_STATUSES = Object.freeze([
  "pending review",
  "investigating",
  "confirmed malicious",
  "confirmed safe",
]);

// A "confirmed" verdict is a FINAL authoritative call (safe OR malicious). Reaching one
// is what fires the closure notification to the members who reported the link.
const isConfirmedStatus = (status) =>
  status === "confirmed malicious" || status === "confirmed safe";

// reviewIndicator: an analyst records their org's AUTHORITATIVE verdict on a global
// indicator, overriding the AI. This is the heart of the "closure loop" (story #7/#10):
//   1. Upsert the org's single OrgReview row (@@unique([orgId, indicatorId])) with the
//      analyst's score/verdict/status + who reviewed it + whether it's shared with the org.
//   2. On a CONFIRMED status, notify every member of this org who submitted this indicator
//      (createNotification → their NotificationBell badge lights up). The analyst is never
//      notified about their own review.
// Takes the prisma client as its first arg (same pattern as the other services here) so
// it's unit-testable with a mock. Returns { orgReview, notified } for the route to send back.
export const reviewIndicator = async (
  prisma,
  { indicatorId, orgId, reviewedBy, humanScore = null, humanVerdict = null, reviewStatus, sharedWithOrg = false }
) => {
  if (!indicatorId) throw new Error("reviewIndicator: indicatorId is required");
  if (!orgId) throw new Error("reviewIndicator: orgId is required (only analysts in an org can review)");
  if (!reviewedBy) throw new Error("reviewIndicator: reviewedBy (analyst user id) is required");
  if (!REVIEW_STATUSES.includes(reviewStatus)) {
    throw new Error(`reviewIndicator: invalid reviewStatus "${reviewStatus}"`);
  }

  // The fields the analyst is setting. Reused for BOTH sides of the upsert so a first
  // review (create) and a re-review (update) write exactly the same authoritative values.
  const reviewData = { humanScore, humanVerdict, reviewStatus, sharedWithOrg, reviewedBy };

  const orgReview = await prisma.orgReview.upsert({
    where: { orgId_indicatorId: { orgId, indicatorId } },
    update: reviewData,
    create: { orgId, indicatorId, ...reviewData },
  });

  // Fire the closure notification only once the verdict is confirmed (final).
  let notified = 0;
  if (isConfirmedStatus(reviewStatus)) {
    // Who in THIS org reported this link? They're the people awaiting closure. One member
    // may have submitted it more than once, so dedup to distinct user ids.
    const submissions = await prisma.submission.findMany({
      where: { indicatorId, orgId },
      select: { userId: true },
    });
    const reporterIds = [...new Set(submissions.map((s) => s.userId))];

    const message = `An analyst confirmed a verdict on a link you reported: ${reviewStatus}.`;
    for (const userId of reporterIds) {
      await createNotification(prisma, { userId, message, type: "verdict_confirmed", indicatorId });
      notified += 1;
    }
  }

  return { orgReview, notified };
};

// Lightweight read for context (askOrbo): just the verdict facts, no org_review.
export const getIndicatorContext = async (indicatorId) => {
  const i = await prisma.indicator.findUnique({ where: { id: indicatorId } });
  if (!i || i.status !== "done") return null;
  return {
    title: i.aiTitle || deriveTitle(i, scoreBucket(i.aiScore)),
    verdict: i.aiVerdict, score: i.aiScore, confidence: i.aiConfidence,
    tags: asArray(i.aiTags) ?? deriveTags(i, scoreBucket(i.aiScore)),
    reasons: (asArray(i.aiReasons) ?? []).map((r) => r.text),
    domain: i.domain,
    // The true destination, so "Ask Orbo more" answers with fact instead of "even if it redirected".
    final_host: i.finalHost,
    redirected_to_different_host: i.redirectedToDifferentHost,
  };
}

// ── derivation helpers (temporary until the columns exist) ──
const deriveTitle = (i, bucket) => {
  if (i.blacklistHit) return "Known bad link";
  if (bucket === "dangerous") return "Dangerous link";
  if (bucket === "review") return "Suspicious link";
  return "Looks safe";
}
const deriveTags = (i, bucket) => {
  const tags = [];
  if (i.blacklistHit) tags.push("Known threat");
  tags.push(bucket === "safe" ? "Safe" : bucket === "dangerous" ? "Dangerous" : "Review");
  return [...new Set(tags)];
}
const firstSentence = (text) => {
  if (!text) return "";
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
const safeDomain = (rawUrl, canonicalKey) => {
  try { return new URL(rawUrl.includes("://") ? rawUrl : `http://${rawUrl}`).hostname.replace(/^www\./, ""); }
  catch { return (canonicalKey.split("/")[0]) || "unknown"; }
}
const errorMessage = (reason) => {
  switch (reason) {
    case "unreachable":
      return "I couldn't reach that link to check it. It looks like an internal, private, or non-existent address — I can only scan links that are reachable on the public internet.";
    case "opted_out":
      return "This site's owner has asked scanners like ours not to inspect it, so I can't run a sandbox check here. That's common for big, well-known companies (e.g. openai.com, google.com) and is usually a good sign — but I can't independently verify it. Only visit it if you trust the source.";
    case "not_configured":
      return "My sandbox scanner isn't configured right now, so I can't fully check this link. Please try again later or review it manually.";
    case "blocked":
      return "I wasn't able to scan that link — the sandbox declined to open it. Please treat it with caution and review it manually.";
    default:
      return "I couldn't finish this check right now. Please try again in a moment, or review the link manually.";
  }
}
