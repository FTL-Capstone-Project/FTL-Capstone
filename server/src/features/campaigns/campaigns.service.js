// ── feature: campaigns · service · owner: David (Intelligence) · built by Ozias for G1·06 ──
// Pure data helper (no Express) so it's easy to unit-test with a mock Prisma.
// Group 3 (David) owns campaign clustering; this endpoint was built as part of the
// closure-loop triage queue (card G1·06) to the agreed contract in project_plan.md §7:
//   GET /api/campaigns → { campaigns: [{ id, name, indicatorCount, reportCount, last_seen }] }
// David can adopt this as-is or replace it — the SHAPE is what the client depends on.

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
