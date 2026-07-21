// ── campaigns · tests · owner: David's slice, built by Ozias for G1·06 ──
// Covers GET /api/campaigns: the listCampaigns() service shape + the route guard.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Part 1 — service unit tests (hand-built mock Prisma, no DB).
// ---------------------------------------------------------------------------
const { listCampaigns } = await import("./campaigns.service.js");

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
// Part 2 — route guard (analyst-only, org-scoped).
// ---------------------------------------------------------------------------
const campaignFindMany = vi.fn(async () => []);
const submissionGroupBy = vi.fn(async () => []);
vi.mock("../../db.js", () => ({
  prisma: {
    campaign: { findMany: (...a) => campaignFindMany(...a) },
    submission: { groupBy: (...a) => submissionGroupBy(...a) },
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
  submissionGroupBy.mockClear();
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
