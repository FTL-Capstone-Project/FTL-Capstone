// ── feature: dashboard · team snapshot · owner: Michael ──
// Org-wide situational awareness for the MEMBER dashboard. A member sees their own
// personal stats (getDashboard) PLUS this team block, so they know what's hitting the
// wider team — not just their own handful of checks.
//
// PRIVACY (story #12 + the Team-History sharing gate):
//   • Everything here is scoped to ONE orgId (never cross-org).
//   • AGGREGATE COUNTS over org submissions are fine — they reveal no individual item
//     ("your team saw 12 credential-phishing attempts this week").
//   • Any LIST of specific items is gated to sharedWithOrg reviews ONLY — the exact
//     same rule Team History uses, so nothing private leaks to a non-analyst member.
import { prisma } from "../../db.js";
import { scoreBucket } from "../../services/verdict.js";

const THREAT_TYPE_LIMIT = 6; // "What's targeting us" bars
const CONFIRMED_LIMIT = 5; // recently-confirmed shared reviews to list

const tagsOf = (indicator) => (Array.isArray(indicator.aiTags) ? indicator.aiTags : []);

const daysAgo = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

/**
 * Build the team-awareness block for a member's dashboard.
 * @param {number} orgId  the caller's org (req.user.orgId) — REQUIRED, never cross-org.
 * @returns {object|null} team block, or null if orgId is missing (individual).
 */
export const getTeamSnapshot = async (orgId) => {
  if (!orgId) return null; // individuals have no team → caller omits the block entirely

  const weekStart = daysAgo(7);

  // Pull every org submission ONCE with its joined indicator (score/tags live there).
  // Aggregate stats are derived in-memory from this list (cheap; one round-trip).
  const submissions = await prisma.submission.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: { indicator: { select: { id: true, aiScore: true, aiTags: true } } },
  });

  // Dedup to unique indicators (same link reported by two teammates = one threat).
  const seen = new Set();
  const uniqueChecks = [];
  for (const s of submissions) {
    if (seen.has(s.indicatorId)) continue;
    seen.add(s.indicatorId);
    uniqueChecks.push(s);
  }

  // ---- Aggregate counts (safe: no individual item revealed) ----
  const reportsThisWeek = submissions.filter((s) => s.createdAt >= weekStart).length;

  const dangerousChecks = uniqueChecks.filter(
    (s) => scoreBucket(s.indicator.aiScore) === "dangerous"
  );
  const threatsThisWeek = dangerousChecks.filter((s) => s.createdAt >= weekStart).length;

  // "What's targeting us" — aiTags frequency across the team's RISKY checks (dangerous +
  // review). aiTags is set on every AI verdict, so this is reliable org-wide intel.
  const riskyChecks = uniqueChecks.filter((s) => scoreBucket(s.indicator.aiScore) !== "safe");
  const tagCounts = new Map();
  for (const s of riskyChecks) {
    for (const tag of tagsOf(s.indicator)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const threatTypes = [...tagCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, THREAT_TYPE_LIMIT);

  // ---- Active campaigns (count only) ----
  // Campaigns are analyst-clustered coordinated attacks. Members see the COUNT as a
  // heads-up; the detail lives on the analyst surface. (Currently only seeded data
  // writes campaigns — this reads whatever exists, and shows 0 cleanly otherwise.)
  const activeCampaigns = await prisma.campaign.count({ where: { orgId } });

  // ---- Recently confirmed by analysts (SHARED reviews only — the privacy gate) ----
  // A member may only see reviews an analyst explicitly shared with the org. We list the
  // most recent shared verdicts so members know what's been confirmed and can stay alert.
  const sharedReviews = await prisma.orgReview.findMany({
    where: { orgId, sharedWithOrg: true },
    orderBy: { updatedAt: "desc" },
    take: CONFIRMED_LIMIT,
    include: {
      indicator: { select: { aiTitle: true, domain: true, aiScore: true } },
      reviewedByUser: { select: { name: true } },
    },
  });
  const recentlyConfirmed = sharedReviews.map((r) => ({
    indicatorId: r.indicatorId,
    title: r.indicator.aiTitle ?? r.indicator.domain,
    domain: r.indicator.domain,
    // Prefer the analyst's authoritative human score; fall back to the AI score.
    score: r.humanScore ?? r.indicator.aiScore,
    kind: scoreBucket(r.humanScore ?? r.indicator.aiScore),
    verdict: r.humanVerdict ?? r.reviewStatus,
    reviewedBy: r.reviewedByUser?.name ?? null,
    at: r.updatedAt,
  }));

  return {
    stats: {
      teamThreatsThisWeek: threatsThisWeek,
      teamReportsThisWeek: reportsThisWeek,
      activeCampaigns,
      teamTotalChecks: uniqueChecks.length,
    },
    threatTypes, // [{ label, count }] — org-wide "what's targeting us"
    recentlyConfirmed, // [{ ...shared review }] — SHARED-only list
  };
};
