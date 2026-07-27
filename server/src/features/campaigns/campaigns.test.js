// ── campaigns · tests · owner: David's slice, built by Ozias for G1·06 ──
// Covers GET /api/campaigns (list) + GET /api/campaigns/:id (detail): the service shapes
// and the route guards.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Part 1 — service unit tests (hand-built mock Prisma, no DB).
// ---------------------------------------------------------------------------
const { listCampaigns, getCampaignDetail } = await import("./campaigns.service.js");

const mockPrisma = ({ campaigns = [], submissionGroups = [] } = {}) => ({
  campaign: { findMany: vi.fn(async () => campaigns) },
  submission: { groupBy: vi.fn(async () => submissionGroups) },
});

describe("listCampaigns", () => {
  it("returns [] for a user with no org (never queries)", async () => {
    const p = mockPrisma();
    expect(await listCampaigns(p, null)).toEqual([]);
    expect(p.campaign.findMany).not.toHaveBeenCalled();
  });

  it("shapes each campaign as { id, name, indicatorCount, reportCount, last_seen }", async () => {
    const lastSeen = new Date("2026-07-08T00:00:00Z");
    const p = mockPrisma({
      // One campaign clustering TWO indicators (10, 11).
      campaigns: [
        { id: 1, name: "Bank impersonation", lastSeen, orgReviews: [{ indicatorId: 10 }, { indicatorId: 11 }] },
      ],
      // 12 reports for indicator 10, 3 for indicator 11 → reportCount 15.
      submissionGroups: [
        { indicatorId: 10, _count: { _all: 12 } },
        { indicatorId: 11, _count: { _all: 3 } },
      ],
    });

    const result = await listCampaigns(p, 99);

    expect(p.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 99 } })
    );
    expect(result).toEqual([
      { id: 1, name: "Bank impersonation", indicatorCount: 2, reportCount: 15, last_seen: lastSeen },
    ]);
  });

  it("handles a campaign with no indicators (counts are zero)", async () => {
    const p = mockPrisma({
      campaigns: [{ id: 2, name: "Empty", lastSeen: new Date("2026-07-01"), orgReviews: [] }],
    });
    const result = await listCampaigns(p, 99);
    expect(result[0]).toMatchObject({ indicatorCount: 0, reportCount: 0 });
    expect(p.submission.groupBy).not.toHaveBeenCalled(); // no indicators → skip the count query
  });
});

// ---------------------------------------------------------------------------
// Part 1b — getCampaignDetail() (the campaign detail page's data).
// ---------------------------------------------------------------------------

// A minimal Submission row shaped like Prisma returns it (with `indicator` + `user` joined),
// because toReportJson() reads straight off those relations.
const submissionRow = ({ indicatorId, createdAt, rawUrl, reporter, aiScore = 22, aiTitle = "Fake PayPal" }) => ({
  indicatorId,
  rawUrl,
  createdAt: new Date(createdAt),
  source: "web",
  user: { name: reporter },
  indicator: { id: indicatorId, aiScore, aiTitle, aiDescription: null, aiVerdict: null, aiTags: [], screenshotUrl: null },
});

const mockDetailPrisma = ({ campaign = null, orgReviews = [], submissions = [] } = {}) => ({
  campaign: { findFirst: vi.fn(async () => campaign) },
  orgReview: { findMany: vi.fn(async () => orgReviews) },
  submission: { findMany: vi.fn(async () => submissions) },
});

const acmeCampaign = {
  id: 1,
  name: "Brand impersonation",
  sharedSignal: "brand-lookalike login domains",
  firstSeen: new Date("2026-07-01T00:00:00Z"),
  lastSeen: new Date("2026-07-08T00:00:00Z"),
};

describe("getCampaignDetail", () => {
  it("returns null for a user with no org (never queries)", async () => {
    const p = mockDetailPrisma();
    expect(await getCampaignDetail(p, { campaignId: 1, orgId: null })).toBe(null);
    expect(p.campaign.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the lookup by orgId, so another org's campaign reads as not-found", async () => {
    const p = mockDetailPrisma({ campaign: null }); // findFirst matched nothing
    expect(await getCampaignDetail(p, { campaignId: 1, orgId: 99 })).toBe(null);
    expect(p.campaign.findFirst).toHaveBeenCalledWith({ where: { id: 1, orgId: 99 } });
    expect(p.orgReview.findMany).not.toHaveBeenCalled(); // stops before loading anything
  });

  it("shapes { campaign, indicators, reportCount } with history-compatible rows", async () => {
    const p = mockDetailPrisma({
      campaign: acmeCampaign,
      orgReviews: [
        { indicatorId: 10, reviewStatus: "confirmed malicious", humanScore: 18, humanVerdict: "Confirmed phishing.",
          sharedWithOrg: true, campaignId: 1, reviewedByUser: { name: "Priya S." } },
        { indicatorId: 11, reviewStatus: "investigating", humanScore: null, humanVerdict: null,
          sharedWithOrg: false, campaignId: 1, reviewedByUser: { name: "Priya S." } },
      ],
      submissions: [
        submissionRow({ indicatorId: 11, createdAt: "2026-07-07", rawUrl: "https://ms-fake.com", reporter: "Anya K.", aiScore: 31, aiTitle: "Fake Microsoft 365" }),
        submissionRow({ indicatorId: 10, createdAt: "2026-07-06", rawUrl: "https://paypa1.com", reporter: "David M." }),
      ],
    });

    const result = await getCampaignDetail(p, { campaignId: 1, orgId: 99 });

    expect(Object.keys(result)).toEqual(["campaign", "indicators", "reportCount"]);
    expect(result.campaign).toEqual({
      id: 1,
      name: "Brand impersonation",
      shared_signal: "brand-lookalike login domains",
      first_seen: acmeCampaign.firstSeen,
      last_seen: acmeCampaign.lastSeen,
      indicatorCount: 2,
    });
    expect(result.reportCount).toBe(2);
    // Rows carry the SAME snake_case fields GET /api/history returns, so the client's
    // existing ReportCard renders them unchanged.
    expect(result.indicators[0]).toMatchObject({
      indicator_id: 11,
      url: "https://ms-fake.com",
      title: "Fake Microsoft 365",
      reported_by: "Anya K.",
      ai_score: 31,
      kind: "dangerous",
      review: { review_status: "investigating", campaign_id: 1 },
    });
    expect(result.indicators[1]).toMatchObject({
      indicator_id: 10,
      reported_by: "David M.",
      review: { review_status: "confirmed malicious", human_score: 18, human_verdict: "Confirmed phishing.", reviewed_by: "Priya S." },
    });
    // One query for ALL the campaign's indicators (no N+1 per indicator).
    expect(p.submission.findMany).toHaveBeenCalledTimes(1);
    expect(p.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 99, indicatorId: { in: [10, 11] } } })
    );
  });

  it("skips a review with no org submission instead of crashing (analyst reviewed it directly)", async () => {
    const p = mockDetailPrisma({
      campaign: acmeCampaign,
      orgReviews: [
        { indicatorId: 10, reviewStatus: "confirmed malicious", humanScore: 18, humanVerdict: null, sharedWithOrg: true, campaignId: 1, reviewedByUser: null },
        // Indicator 12 has a review but nobody in the org ever submitted it → no url/date to show.
        { indicatorId: 12, reviewStatus: "pending review", humanScore: null, humanVerdict: null, sharedWithOrg: false, campaignId: 1, reviewedByUser: null },
      ],
      submissions: [
        submissionRow({ indicatorId: 10, createdAt: "2026-07-06", rawUrl: "https://paypa1.com", reporter: "David M." }),
      ],
    });

    const result = await getCampaignDetail(p, { campaignId: 1, orgId: 99 });

    expect(result.indicators).toHaveLength(1);
    expect(result.indicators[0].indicator_id).toBe(10);
    expect(result.campaign.indicatorCount).toBe(1); // counts what we can actually show
  });

  it("dedupes to one row per indicator, keeping the newest submission", async () => {
    const p = mockDetailPrisma({
      campaign: acmeCampaign,
      orgReviews: [{ indicatorId: 10, reviewStatus: "pending review", humanScore: null, humanVerdict: null, sharedWithOrg: false, campaignId: 1, reviewedByUser: null }],
      // Prisma returns these newest-first (orderBy desc), so the first one wins.
      submissions: [
        submissionRow({ indicatorId: 10, createdAt: "2026-07-09", rawUrl: "https://newest.example", reporter: "Anya K." }),
        submissionRow({ indicatorId: 10, createdAt: "2026-07-02", rawUrl: "https://older.example", reporter: "David M." }),
      ],
    });

    const result = await getCampaignDetail(p, { campaignId: 1, orgId: 99 });

    expect(result.indicators).toHaveLength(1);
    expect(result.indicators[0].url).toBe("https://newest.example");
    expect(result.reportCount).toBe(2); // …but BOTH reports still count
  });

  it("a campaign with no reviews returns empty rows (and skips the submission query)", async () => {
    const p = mockDetailPrisma({ campaign: { ...acmeCampaign, sharedSignal: null }, orgReviews: [] });
    const result = await getCampaignDetail(p, { campaignId: 1, orgId: 99 });
    expect(result.indicators).toEqual([]);
    expect(result.reportCount).toBe(0);
    expect(result.campaign.shared_signal).toBe(null); // nullable in the schema
    expect(p.submission.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Part 2 — route guard (analyst-only, org-scoped).
// ---------------------------------------------------------------------------
const campaignFindMany = vi.fn(async () => []);
const campaignFindFirst = vi.fn(async () => null);
const submissionGroupBy = vi.fn(async () => []);
const submissionFindMany = vi.fn(async () => []);
const orgReviewFindMany = vi.fn(async () => []);
vi.mock("../../db.js", () => ({
  prisma: {
    campaign: {
      findMany: (...a) => campaignFindMany(...a),
      findFirst: (...a) => campaignFindFirst(...a),
    },
    orgReview: { findMany: (...a) => orgReviewFindMany(...a) },
    submission: {
      groupBy: (...a) => submissionGroupBy(...a),
      findMany: (...a) => submissionFindMany(...a),
    },
  },
}));

const { campaignsRouter } = await import("./campaigns.routes.js");

const appAs = (user) => {
  const app = express();
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/campaigns", campaignsRouter);
  return app;
}

beforeEach(() => {
  campaignFindMany.mockClear();
  campaignFindFirst.mockClear();
  submissionGroupBy.mockClear();
  submissionFindMany.mockClear();
  orgReviewFindMany.mockClear();
  campaignFindFirst.mockResolvedValue(null); // default: no such campaign for this org
});

describe("GET /api/campaigns (route)", () => {
  it("403 for a non-analyst (member)", async () => {
    const res = await request(appAs({ id: 2, role: "member", orgId: 99 })).get("/api/campaigns");
    expect(res.status).toBe(403);
    expect(campaignFindMany).not.toHaveBeenCalled();
  });

  it("200 for an analyst — scoped to their org", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 99 })).get("/api/campaigns");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ campaigns: [] });
    expect(campaignFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 99 } }));
  });
});

describe("GET /api/campaigns/:id (route)", () => {
  it("403 for a non-analyst (member) — and never touches the DB", async () => {
    const res = await request(appAs({ id: 2, role: "member", orgId: 99 })).get("/api/campaigns/1");
    expect(res.status).toBe(403);
    expect(campaignFindFirst).not.toHaveBeenCalled();
  });

  it("400 for a non-numeric id (no bogus query runs)", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 99 })).get("/api/campaigns/abc");
    expect(res.status).toBe(400);
    expect(campaignFindFirst).not.toHaveBeenCalled();
  });

  it("404 when the campaign is missing OR belongs to another org (no existence leak)", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 99 })).get("/api/campaigns/1");
    expect(res.status).toBe(404);
    // orgId is part of the WHERE, so a wrong-org id simply doesn't match.
    expect(campaignFindFirst).toHaveBeenCalledWith({ where: { id: 1, orgId: 99 } });
  });

  it("200 with { campaign, indicators, reportCount } for the analyst's own org", async () => {
    campaignFindFirst.mockResolvedValue({
      id: 1, name: "Brand impersonation", sharedSignal: "brand-lookalike login domains",
      firstSeen: new Date("2026-07-01T00:00:00Z"), lastSeen: new Date("2026-07-08T00:00:00Z"),
    });
    orgReviewFindMany.mockResolvedValue([
      { indicatorId: 10, reviewStatus: "confirmed malicious", humanScore: 18, humanVerdict: "Confirmed phishing.",
        sharedWithOrg: true, campaignId: 1, reviewedByUser: { name: "Priya S." } },
    ]);
    submissionFindMany.mockResolvedValue([
      { indicatorId: 10, rawUrl: "https://paypa1.com", createdAt: new Date("2026-07-06T00:00:00Z"), source: "web",
        user: { name: "David M." },
        indicator: { id: 10, aiScore: 22, aiTitle: "Fake PayPal", aiDescription: null, aiVerdict: null, aiTags: [], screenshotUrl: null } },
    ]);

    const res = await request(appAs({ id: 7, role: "analyst", orgId: 99 })).get("/api/campaigns/1");

    expect(res.status).toBe(200);
    expect(res.body.campaign).toMatchObject({ id: 1, name: "Brand impersonation", indicatorCount: 1 });
    expect(res.body.reportCount).toBe(1);
    expect(res.body.indicators).toHaveLength(1);
    expect(res.body.indicators[0]).toMatchObject({ indicator_id: 10, title: "Fake PayPal", reported_by: "David M." });
    expect(orgReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 1, orgId: 99 } })
    );
  });
});
