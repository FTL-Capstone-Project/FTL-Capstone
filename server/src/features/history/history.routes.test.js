import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the DB module the router imports, so no live Postgres is needed.
// Each test sets what findMany/count returns via these fns.
const submissionFindMany = vi.fn();
const orgReviewFindMany = vi.fn();
const orgReviewCount = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    submission: { findMany: (...a) => submissionFindMany(...a) },
    orgReview: {
      findMany: (...a) => orgReviewFindMany(...a),
      count: (...a) => orgReviewCount(...a),
    },
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
  orgReviewCount.mockReset();
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

describe("GET /api/history (analyst stats — no ?mine/?org)", () => {
  // Mock setup: the stats branch calls submission.findMany TWICE (all subs + recent),
  // then orgReview.findMany ONCE (pending age / throughput / AI agreement). We queue
  // the two submission return values, and set orgReviewFindMany per test.
  const analystUser = { id: 7, orgId: 99, role: "analyst", name: "Priya S." };

  // Widened to carry the fields the new analyst stats read: source (channel split),
  // user.name (top reporters), and the indicator's aiConfidence + red-flag signals.
  const makeSub = (indicatorId, aiScore, createdAt, name = "Anya K.", { source = "web", aiConfidence = null } = {}) => ({
    indicatorId,
    rawUrl: `https://example.com/${indicatorId}`,
    createdAt: new Date(createdAt),
    source,
    indicator: {
      aiTitle: `title-${indicatorId}`, domain: `d${indicatorId}.com`, finalHost: null, aiTags: [], aiScore,
      aiConfidence, blacklistHit: false, redirectedToDifferentHost: false, domainAgeDays: null,
    },
    user: { name },
  });

  it("403 for a non-analyst (member)", async () => {
    const res = await request(appAs({ id: 2, orgId: 99, role: "member", name: "David" }))
      .get("/api/history");
    expect(res.status).toBe(403);
    expect(submissionFindMany).not.toHaveBeenCalled();
  });

  it("403 for an individual (no org)", async () => {
    const res = await request(appAs({ id: 1, orgId: null, role: "individual", name: "Solo" }))
      .get("/api/history");
    expect(res.status).toBe(403);
  });

  it("returns stats + recent scoped strictly to req.user.orgId", async () => {
    // submission.findMany is called TWICE now: all-subs (also powers the 30-day trend in-memory),
    // then the recent-activity feed. (The trend no longer runs its own query.)
    submissionFindMany
      .mockResolvedValueOnce([
        // all org subs (for verdict breakdown + confidence/channel/reporter/trend stats)
        makeSub(10, 22, "2026-07-15", "Anya K.", { source: "email", aiConfidence: "high" }),  // dangerous
        makeSub(11, 91, "2026-07-14", "Anya K.", { aiConfidence: "low" }),                     // safe
        makeSub(12, 54, "2026-07-13", "Marcus T.", { aiConfidence: "medium" }),                // review
      ])
      .mockResolvedValueOnce([
        // recent activity feed (carries screenshotUrl for the queue thumbnail)
        { ...makeSub(10, 22, "2026-07-15", "Marcus T."), rawUrl: "https://ex.com/10", indicator: { aiTitle: "title-10", domain: "d10.com", aiScore: 22, screenshotUrl: "https://cdn/shot10.png" } },
      ]);
    // orgReview.findMany now powers pending age / throughput / AI agreement / calibration /
    // turnaround / shared rate. Two pending reviews, plus one closed+shared review where the
    // analyst's band matches the AI's band (18 vs 22 → both dangerous).
    orgReviewFindMany.mockResolvedValue([
      { indicatorId: 11, reviewStatus: "pending review", humanScore: null, sharedWithOrg: false, createdAt: new Date("2026-07-10"), updatedAt: new Date("2026-07-10"), indicator: { aiScore: 20 } },
      { indicatorId: 12, reviewStatus: "pending review", humanScore: null, sharedWithOrg: false, createdAt: new Date("2026-07-14"), updatedAt: new Date("2026-07-14"), indicator: { aiScore: 40 } },
      { indicatorId: 10, reviewStatus: "confirmed malicious", humanScore: 18, sharedWithOrg: true, createdAt: new Date("2026-07-12"), updatedAt: new Date("2026-07-15"), indicator: { aiScore: 22 } },
    ]);

    const res = await request(appAs(analystUser)).get("/api/history");

    expect(res.status).toBe(200);

    // Every submission.findMany call must be scoped to the analyst's orgId.
    for (const call of submissionFindMany.mock.calls) {
      expect(call[0].where).toMatchObject({ orgId: 99 });
    }
    // orgReview.findMany must also be scoped to the same orgId.
    expect(orgReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 99 }) })
    );

    // Verdict breakdown reflects the 3 unique indicators above.
    expect(res.body.stats.verdictBreakdown).toMatchObject({
      safe: 1,
      review: 1,
      dangerous: 1,
      total: 3,
    });
    expect(res.body.stats.pendingCount).toBe(2);
    // AI agreement: the one analyst-scored review (18 vs 22, both dangerous) → 100%.
    expect(res.body.stats.aiAgreement).toMatchObject({ pct: 100, sample: 1 });
    // Score calibration: signed avg (human − AI) = 18 − 22 = −4 (team scores stricter).
    expect(res.body.stats.scoreCalibration).toMatchObject({ avgDelta: -4, sample: 1 });
    // Turnaround: the one closed review opened 07-12, closed 07-15 → 3 days.
    expect(res.body.stats.avgTurnaroundDays).toBe(3);
    // Shared rate: 1 of 1 closed reviews was shared → 100%.
    expect(res.body.stats.sharedRate).toMatchObject({ pct: 100, shared: 1, closed: 1 });
    // Confidence mix across the 3 unique indicators: one each high/medium/low.
    expect(res.body.stats.confidenceMix).toMatchObject({ high: 1, medium: 1, low: 1, unknown: 0 });
    // Channel split (per submission): 1 email + 2 web.
    expect(res.body.stats.channels).toMatchObject({ web: 2, email: 1 });
    // Top reporters (per submission): Anya K. reported 2, Marcus T. 1.
    expect(res.body.stats.topReporters).toEqual([
      { name: "Anya K.", count: 2 },
      { name: "Marcus T.", count: 1 },
    ]);

    // Trend now spans 30 buckets (one per day) — widened from 7 so older org data shows.
    expect(res.body.stats.trend).toHaveLength(30);

    // Recent activity has the indicator details (pending queue), now including the real
    // screenshot URL (thumbnail) and the review status (18 vs 22 review is "confirmed malicious").
    expect(res.body.recent).toHaveLength(1);
    expect(res.body.recent[0]).toMatchObject({
      indicatorId: 10,
      kind: "dangerous",
      reporter: "Marcus T.",
      screenshotUrl: "https://cdn/shot10.png",
      reviewStatus: "confirmed malicious",
    });
    // ...and the reshaped right-rail activity feed (kind/label/subject/at).
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.activity[0]).toMatchObject({
      kind: "submission",
      label: "Reported by Marcus T.",
    });
  });

  it("deduplicates the verdict breakdown (same indicator reported multiple times)", async () => {
    // Indicator 10 reported twice → counts as ONE verdict, not two.
    submissionFindMany
      .mockResolvedValueOnce([
        makeSub(10, 22, "2026-07-15"),
        makeSub(10, 22, "2026-07-14"), // duplicate
      ])
      .mockResolvedValueOnce([]); // recent activity (trend is now derived from the all-subs call)
    orgReviewFindMany.mockResolvedValue([]); // no reviews → pending 0, agreement null

    const res = await request(appAs(analystUser)).get("/api/history");

    expect(res.status).toBe(200);
    expect(res.body.stats.verdictBreakdown.total).toBe(1);   // deduplicated
    expect(res.body.stats.verdictBreakdown.dangerous).toBe(1);
    expect(res.body.stats.pendingCount).toBe(0);
    expect(res.body.stats.aiAgreement).toBeNull(); // no analyst-scored reviews
    // No reviews at all → every review-derived stat falls back to null (client shows empty states).
    expect(res.body.stats.scoreCalibration).toBeNull();
    expect(res.body.stats.avgTurnaroundDays).toBeNull();
    expect(res.body.stats.sharedRate).toBeNull();
    // Confidence unknown (aiConfidence not set on the deduped indicator) folds into `unknown`.
    expect(res.body.stats.confidenceMix).toMatchObject({ high: 0, medium: 0, low: 0, unknown: 1 });
  });
});
