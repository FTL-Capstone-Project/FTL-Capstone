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

describe("GET /api/history?mine=1 (My History)", () => {
  it("returns the caller's own reports, scoped to their user id", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ id: 1, indicatorId: 10, aiScore: 91, name: "Me", createdAt: new Date("2026-07-10") }),
    ]);

    const res = await request(appAs({ id: 7, orgId: null, name: "Sofia R." })).get("/api/history?mine=1");

    expect(res.status).toBe(200);
    // The query is filtered by the verified caller's id, never by client input.
    expect(submissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } })
    );
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.reports[0].kind).toBe("safe"); // score 91 → safe
  });

  it("individual (no org) gets review: null and never queries orgReview", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ id: 1, indicatorId: 10, aiScore: 22, name: "Me", createdAt: new Date("2026-07-10") }),
    ]);

    const res = await request(appAs({ id: 7, orgId: null, name: "Sofia R." })).get("/api/history?mine=1");

    expect(res.body.reports[0].review).toBeNull();
    // No org → the private org-review join is skipped entirely.
    expect(orgReviewFindMany).not.toHaveBeenCalled();
  });

  it("merges the org review for a member's own checks", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ id: 1, indicatorId: 10, aiScore: 22, name: "Me", createdAt: new Date("2026-07-10") }),
    ]);
    orgReviewFindMany.mockResolvedValue([
      { indicatorId: 10, reviewStatus: "confirmed malicious", humanScore: 15, sharedWithOrg: false, reviewedByUser: { name: "Priya S." } },
    ]);

    const res = await request(appAs({ id: 7, orgId: 99, name: "David M." })).get("/api/history?mine=1");

    // Members DO see their own review even if it isn't shared org-wide (?mine=1
    // has no sharedWithOrg gate — that gate is only for ?org=1 Team History).
    expect(orgReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 99 }) })
    );
    expect(res.body.reports[0].review.review_status).toBe("confirmed malicious");
    expect(res.body.reports[0].review.reviewed_by).toBe("Priya S.");
  });

  it("dedups to one card per indicator (keeps the newest submission)", async () => {
    // Same link checked twice by me; the findMany is ordered newest-first.
    submissionFindMany.mockResolvedValue([
      sub({ id: 2, indicatorId: 10, aiScore: 54, name: "Me", createdAt: new Date("2026-07-10") }),
      sub({ id: 1, indicatorId: 10, aiScore: 54, name: "Me", createdAt: new Date("2026-07-06") }),
    ]);

    const res = await request(appAs({ id: 7, orgId: null, name: "Sofia R." })).get("/api/history?mine=1");

    expect(res.body.reports).toHaveLength(1); // one card, newest kept
  });
});
