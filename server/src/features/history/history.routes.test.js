import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the DB module the router imports, so no live Postgres is needed.
// Each test sets what findMany returns via these fns.
const submissionFindMany = vi.fn();
const orgReviewFindMany = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    submission: { findMany: (...a) => submissionFindMany(...a) },
    orgReview: { findMany: (...a) => orgReviewFindMany(...a) },
  },
}));

// Import AFTER the mock is registered.
const { historyRouter } = await import("./history.routes.js");

// Build a tiny app that injects a chosen user, then mounts the real router.
// requireAuth (dev-stub mode in tests) does `req.user = req.user ?? stub`, so
// setting req.user here is preserved — letting us test the org-member path.
const appAs = (user) => {
  const app = express();
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/history", historyRouter);
  return app;
}

// One fake submission joined with its indicator + reporter, like the route includes.
const sub = ({ id, indicatorId, aiScore, name, createdAt }) => {
  return {
    id,
    indicatorId,
    rawUrl: `https://example.com/${id}`,
    createdAt,
    indicator: { id: indicatorId, aiScore, aiTitle: `t${indicatorId}`, aiDescription: "d", aiTags: [], screenshotUrl: null },
    user: { name },
  };
}

beforeEach(() => {
  submissionFindMany.mockReset();
  orgReviewFindMany.mockReset();
});

describe("GET /api/history?org=1 (Team History)", () => {
  it("individual (no org) → empty list, never queries the DB", async () => {
    const res = await request(appAs({ id: 1, orgId: null, name: "Solo" })).get("/api/history?org=1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reports: [] });
    expect(submissionFindMany).not.toHaveBeenCalled();
  });

  it("member → returns the org's shared reports, scoped to their orgId", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ id: 1, indicatorId: 10, aiScore: 22, name: "Anya K.", createdAt: new Date("2026-07-08") }),
    ]);
    orgReviewFindMany.mockResolvedValue([
      { indicatorId: 10, reviewStatus: "confirmed malicious", humanScore: 18, sharedWithOrg: true, reviewedByUser: { name: "Priya S." } },
    ]);

    const res = await request(appAs({ id: 2, orgId: 99, name: "David M." })).get("/api/history?org=1");

    expect(res.status).toBe(200);
    // Query is filtered by the caller's org, not by anything the client sent.
    expect(submissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 99 } })
    );
    // Only analyst-shared reviews are fetched (the privacy gate).
    expect(orgReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 99, sharedWithOrg: true }) })
    );
    expect(res.body.reports).toHaveLength(1);
    const r = res.body.reports[0];
    expect(r.reported_by).toBe("Anya K.");           // teammate's name, not the caller's
    expect(r.kind).toBe("dangerous");                 // derived from score 22
    expect(r.review.review_status).toBe("confirmed malicious");
    expect(r.review.reviewed_by).toBe("Priya S.");
    expect(r.review.shared_with_org).toBe(true);
  });

  it("excludes indicators with no shared review (privacy gate)", async () => {
    // Two org submissions, but the org-review query returns nothing shared → no cards.
    submissionFindMany.mockResolvedValue([
      sub({ id: 1, indicatorId: 10, aiScore: 22, name: "Anya K.", createdAt: new Date("2026-07-08") }),
      sub({ id: 2, indicatorId: 11, aiScore: 91, name: "Sarah L.", createdAt: new Date("2026-07-07") }),
    ]);
    orgReviewFindMany.mockResolvedValue([]); // nothing analyst-shared for this org

    const res = await request(appAs({ id: 2, orgId: 99, name: "David M." })).get("/api/history?org=1");

    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(0); // reviewed-and-shared only → empty
  });

  it("analyst triage (?org=1&all=1) includes pending + unreviewed items", async () => {
    // Two org indicators: one pending review, one with NO review row at all.
    submissionFindMany.mockResolvedValue([
      sub({ id: 1, indicatorId: 10, aiScore: 54, name: "Marcus T.", createdAt: new Date("2026-07-06") }),
      sub({ id: 2, indicatorId: 11, aiScore: 31, name: "Anya K.",  createdAt: new Date("2026-07-07") }),
    ]);
    // Only indicator 10 has a review, and it's pending (NOT shared).
    orgReviewFindMany.mockResolvedValue([
      { indicatorId: 10, reviewStatus: "pending review", humanScore: null, sharedWithOrg: false, reviewedByUser: null },
    ]);

    const res = await request(appAs({ id: 7, orgId: 99, role: "analyst", name: "Priya S." }))
      .get("/api/history?org=1&all=1");

    expect(res.status).toBe(200);
    // Triage mode drops the sharedWithOrg gate → the review query is NOT filtered by it.
    expect(orgReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ sharedWithOrg: true }) })
    );
    // BOTH indicators appear: the pending one AND the never-reviewed one (review: null).
    expect(res.body.reports).toHaveLength(2);
    const byId = Object.fromEntries(res.body.reports.map((r) => [r.indicator_id, r]));
    expect(byId[10].review.review_status).toBe("pending review");
    expect(byId[11].review).toBeNull();
  });

  it("a non-analyst passing all=1 is ignored (still shared-only)", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ id: 1, indicatorId: 10, aiScore: 54, name: "Marcus T.", createdAt: new Date("2026-07-06") }),
    ]);
    orgReviewFindMany.mockResolvedValue([]); // nothing shared

    const res = await request(appAs({ id: 2, orgId: 99, role: "member", name: "David M." }))
      .get("/api/history?org=1&all=1");

    expect(res.status).toBe(200);
    // Member: the gate still applies, so the query DOES filter by sharedWithOrg.
    expect(orgReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sharedWithOrg: true }) })
    );
    expect(res.body.reports).toHaveLength(0);
  });

  it("dedups to one card per indicator (keeps the newest submission)", async () => {
    // Two submissions of the SAME shared indicator by different teammates; newest first.
    submissionFindMany.mockResolvedValue([
      sub({ id: 2, indicatorId: 10, aiScore: 54, name: "Marcus T.", createdAt: new Date("2026-07-10") }),
      sub({ id: 1, indicatorId: 10, aiScore: 54, name: "David M.",  createdAt: new Date("2026-07-06") }),
    ]);
    orgReviewFindMany.mockResolvedValue([
      { indicatorId: 10, reviewStatus: "pending review", humanScore: null, sharedWithOrg: true, reviewedByUser: null },
    ]);

    const res = await request(appAs({ id: 2, orgId: 99, name: "David M." })).get("/api/history?org=1");

    expect(res.body.reports).toHaveLength(1);            // one card, not two
    expect(res.body.reports[0].reported_by).toBe("Marcus T."); // newest wins
    expect(res.body.reports[0].review.shared_with_org).toBe(true);
  });
});
