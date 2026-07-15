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
import { escalateSubmission } from "../submissions/submissions.service.js";

// In dev-stub auth mode, req.user is a fake { id: 1, ... } that may not exist in the DB,
// so a submission FK would fail. Resolve a REAL mirror row for it (upsert by a stable
// clerkUserId) and use that id. In real Clerk mode, req.user.id is already a real row.
async function resolveUserId(user) {
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
export async function submitUrl({ rawUrl, user, contextText = null, source = "web" }) {
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

// The real pipeline: scanning → urlscan + Safe Browsing → verdict → done. Writes each phase.
async function runPipeline(indicatorId, rawUrl, contextText) {
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

// Shape one indicator for the client poll (GET /api/indicators/:id), merging the
// caller's org_review if any. Field names match what the client + Reports card expect.
export async function readIndicatorForClient(indicatorId, user) {
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

  const base = { status: indicator.status, screenshot_url: indicator.screenshotUrl, review };
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
    // Where the link actually goes — lets the card show a "goes to amazon.com" cue.
    final_url: indicator.finalUrl,
    final_host: indicator.finalHost,
    redirected_to_different_host: indicator.redirectedToDifferentHost,
  };
}

// Lightweight read for context (askOrbo): just the verdict facts, no org_review.
export async function getIndicatorContext(indicatorId) {
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

// Prisma Json comes back parsed; guard against null/non-array from older rows.
function asArray(v) { return Array.isArray(v) ? v : null; }

// ── derivation helpers (temporary until the columns exist) ──
function deriveTitle(i, bucket) {
  if (i.blacklistHit) return "Known bad link";
  if (bucket === "dangerous") return "Dangerous link";
  if (bucket === "review") return "Suspicious link";
  return "Looks safe";
}
function deriveTags(i, bucket) {
  const tags = [];
  if (i.blacklistHit) tags.push("Known threat");
  tags.push(bucket === "safe" ? "Safe" : bucket === "dangerous" ? "Dangerous" : "Review");
  return [...new Set(tags)];
}
function firstSentence(text) {
  if (!text) return "";
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
function safeDomain(rawUrl, canonicalKey) {
  try { return new URL(rawUrl.includes("://") ? rawUrl : `http://${rawUrl}`).hostname.replace(/^www\./, ""); }
  catch { return (canonicalKey.split("/")[0]) || "unknown"; }
}
function errorMessage(reason) {
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
