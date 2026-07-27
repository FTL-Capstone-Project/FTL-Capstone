// ── feature: campaigns · service · owner: David (Intelligence) · built by Ozias for G1·06 ──
// Pure data helper (no Express) so it's easy to unit-test with a mock Prisma.
// Group 3 (David) owns campaign clustering; this endpoint was built as part of the
// closure-loop triage queue (card G1·06) to the agreed contract in project_plan.md §7:
//   GET /api/campaigns → { campaigns: [{ id, name, indicatorCount, reportCount, last_seen }] }
// David can adopt this as-is or replace it — the SHAPE is what the client depends on.
import { toReportJson } from "../history/history.service.js";

// List one org's campaigns with the two counts the triage queue shows:
//   indicatorCount = how many distinct indicators (links) are clustered in the campaign
//   reportCount    = how many times those indicators were reported across the org
// Scoped to a single orgId (story #12 data isolation — never cross-org).
export const listCampaigns = async (prisma, orgId) => {
  if (!orgId) return []; // no org → no campaigns (individuals never have any)

  const campaigns = await prisma.campaign.findMany({
    where: { orgId },
    orderBy: { lastSeen: "desc" },
    include: {
      // Each campaign's org-reviews carry the indicatorId + let us count reports.
      orgReviews: { select: { indicatorId: true } },
    },
  });

  // For reportCount we need how many submissions exist for the campaign's indicators.
  // One grouped query for the whole org avoids an N+1 across campaigns.
  const allIndicatorIds = campaigns.flatMap((c) => c.orgReviews.map((r) => r.indicatorId));
  const submissionCounts = allIndicatorIds.length
    ? await prisma.submission.groupBy({
        by: ["indicatorId"],
        where: { orgId, indicatorId: { in: allIndicatorIds } },
        _count: { _all: true },
      })
    : [];
  const reportsByIndicator = new Map(submissionCounts.map((s) => [s.indicatorId, s._count._all]));

  return campaigns.map((c) => {
    const indicatorIds = [...new Set(c.orgReviews.map((r) => r.indicatorId))];
    const reportCount = indicatorIds.reduce((sum, id) => sum + (reportsByIndicator.get(id) ?? 0), 0);
    return {
      id: c.id,
      name: c.name,
      indicatorCount: indicatorIds.length,
      reportCount,
      last_seen: c.lastSeen,
    };
  });
}

// ── GET /api/campaigns/:id — one campaign, plus every report clustered under it ──
// Feeds the CampaignDetail page (the triage queue's campaign row links here). Contract
// in project_plan.md §6: { campaign, indicators: [...], reportCount }.
//
// The join path is Campaign → OrgReview → Indicator, and NONE of those carry the fields a
// ReportCard needs (url, who reported it, when). Those live on Submission. So we fetch the
// org's submissions for those indicators and reuse history's toReportJson() — that way the
// rows are byte-for-byte the same shape as GET /api/history and the client can render them
// with the SAME ReportCard / ReportDetailModal, no new components.
//
// Returns null when the campaign doesn't exist OR belongs to another org (the route turns
// that into a 404, so we never confirm another org's campaign exists — story #12).
export const getCampaignDetail = async (prisma, { campaignId, orgId }) => {
  if (!orgId) return null; // no org → no campaigns (individuals never have any)

  // orgId is part of the WHERE, not a check afterwards: another org's id simply doesn't match.
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } });
  if (!campaign) return null;

  // Every review the analyst clustered into this campaign. No sharedWithOrg filter — this
  // route is analyst-only, so pending/investigating items must be visible (same reasoning as
  // the triage queue's all=1 mode). reviewedByUser is needed for "Scored by <analyst>".
  const orgReviews = await prisma.orgReview.findMany({
    where: { campaignId, orgId },
    include: { reviewedByUser: true },
  });
  const indicatorIds = [...new Set(orgReviews.map((r) => r.indicatorId))];

  // ONE submission query for all of the campaign's indicators (an N+1 would be one query per
  // indicator). Newest first so the dedup below keeps the most recent report per link.
  const submissions = indicatorIds.length
    ? await prisma.submission.findMany({
        where: { orgId, indicatorId: { in: indicatorIds } },
        orderBy: { createdAt: "desc" },
        include: { indicator: true, user: true },
      })
    : [];

  const reviewsByIndicator = new Map(orgReviews.map((r) => [r.indicatorId, r]));

  // One card per indicator — if two teammates reported the same link, show it once (newest
  // wins, which is first after the sort). Same dedup the history routes use.
  const seen = new Set();
  const indicators = [];
  for (const submission of submissions) {
    if (seen.has(submission.indicatorId)) continue;
    seen.add(submission.indicatorId);
    const review = reviewsByIndicator.get(submission.indicatorId) ?? null;
    indicators.push(toReportJson(submission, review, submission.user?.name));
  }
  // Reviews with NO org submission are skipped on purpose: an analyst can create a review
  // straight from PATCH /review, and a report row needs a real submission for its url/date.
  // Rather than fabricate one, we leave it out.

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      shared_signal: campaign.sharedSignal ?? null, // nullable in the schema
      first_seen: campaign.firstSeen,
      last_seen: campaign.lastSeen,
      indicatorCount: indicators.length,
    },
    indicators,
    // Same meaning as the list endpoint's reportCount: how many times the org reported
    // these links (submission ROWS), not the global Indicator.reportCount.
    reportCount: submissions.length,
  };
}
