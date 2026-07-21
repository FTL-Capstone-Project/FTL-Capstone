// ── closure loop (analyst review) · tests · owner: Ozias ──
// Covers PATCH /api/indicators/:id/review (card G1·01):
//   1. reviewIndicator() service — upsert shape + createNotification fires on confirm.
//   2. the route — 403 for non-analysts, 200 for analysts (injected req.user).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Part 1 — service unit tests. Pass a hand-built mock Prisma directly (same
// style as submissions.service.test.js), so no DB and no vi.mock needed here.
// ---------------------------------------------------------------------------

// A fresh mock Prisma for each case. submission.findMany returns whatever
// reporters we want; the upsert/create just echo their inputs back.
const mockPrisma = (submissions = []) => {
  return {
    orgReview: {
      upsert: vi.fn(async ({ create }) => ({ id: 1, ...create })),
    },
    submission: {
      findMany: vi.fn(async () => submissions),
    },
    notification: {
      create: vi.fn(async ({ data }) => ({ id: 99, ...data })),
    },
  };
}

// Imported directly (no mocks) — pure function, prisma is an argument.
const { reviewIndicator } = await import("./indicators.service.js");

describe("reviewIndicator (analyst authoritative verdict)", () => {
  it("upserts the OrgReview on (orgId, indicatorId) with the analyst's values", async () => {
    const p = mockPrisma();
    await reviewIndicator(p, {
      indicatorId: 10,
      orgId: 2,
      reviewedBy: 7,
      humanScore: 18,
      humanVerdict: "Credential-phishing page impersonating PayPal.",
      reviewStatus: "confirmed malicious",
      sharedWithOrg: true,
    });

    // The write targets the unique per-org key and stores every authoritative field.
    expect(p.orgReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_indicatorId: { orgId: 2, indicatorId: 10 } },
        update: expect.objectContaining({
          humanScore: 18,
          reviewStatus: "confirmed malicious",
          sharedWithOrg: true,
          reviewedBy: 7,
        }),
        create: expect.objectContaining({
          orgId: 2,
          indicatorId: 10,
          reviewStatus: "confirmed malicious",
          reviewedBy: 7,
        }),
      })
    );
  });

  it("on a CONFIRMED status, notifies each distinct org member who reported the link", async () => {
    // Two reporters, one of whom submitted twice → we should notify 2 distinct users.
    const p = mockPrisma([{ userId: 4 }, { userId: 4 }, { userId: 5 }]);

    const result = await reviewIndicator(p, {
      indicatorId: 10, orgId: 2, reviewedBy: 7, reviewStatus: "confirmed safe",
    });

    expect(p.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { indicatorId: 10, orgId: 2 } })
    );
    expect(p.notification.create).toHaveBeenCalledTimes(2);
    expect(p.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 4, type: "verdict_confirmed", indicatorId: 10 }),
      })
    );
    expect(result.notified).toBe(2);
  });

  it("does NOT notify for a non-confirmed status (pending review / investigating)", async () => {
    const p = mockPrisma([{ userId: 4 }]);
    const result = await reviewIndicator(p, {
      indicatorId: 10, orgId: 2, reviewedBy: 7, reviewStatus: "investigating",
    });

    expect(p.orgReview.upsert).toHaveBeenCalledOnce();      // review still saved
    expect(p.notification.create).not.toHaveBeenCalled();   // but no closure ping yet
    expect(result.notified).toBe(0);
  });

  it("rejects an unknown reviewStatus (so we never store a chip the UI can't render)", async () => {
    const p = mockPrisma();
    await expect(
      reviewIndicator(p, { indicatorId: 10, orgId: 2, reviewedBy: 7, reviewStatus: "totally bogus" })
    ).rejects.toThrow(/invalid reviewStatus/);
    expect(p.orgReview.upsert).not.toHaveBeenCalled();
  });

  it("throws if a required field is missing", async () => {
    const p = mockPrisma();
    await expect(reviewIndicator(p, { orgId: 2, reviewedBy: 7, reviewStatus: "investigating" }))
      .rejects.toThrow(/indicatorId/);
    await expect(reviewIndicator(p, { indicatorId: 10, reviewedBy: 7, reviewStatus: "investigating" }))
      .rejects.toThrow(/orgId/);
    await expect(reviewIndicator(p, { indicatorId: 10, orgId: 2, reviewStatus: "investigating" }))
      .rejects.toThrow(/reviewedBy/);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — route tests. Mock db.js so the real router runs with no live DB,
// and inject req.user to exercise the requireAnalyst guard (403 vs 200).
// ---------------------------------------------------------------------------

// These fns back the mocked prisma the ROUTE imports from db.js.
const orgReviewUpsert = vi.fn(async ({ create }) => ({ id: 1, ...create }));
const submissionFindMany = vi.fn(async () => []);
const notificationCreate = vi.fn(async ({ data }) => ({ id: 99, ...data }));
vi.mock("../../db.js", () => ({
  prisma: {
    orgReview: { upsert: (...a) => orgReviewUpsert(...a) },
    submission: { findMany: (...a) => submissionFindMany(...a) },
    notification: { create: (...a) => notificationCreate(...a) },
  },
}));
// The service module also imports these scanners at load time; stub so importing
// the router never touches the network (same guard reportIndicator.test.js uses).
vi.mock("../../services/urlscan.js", () => ({ scanUrl: vi.fn() }));
vi.mock("../../services/safeBrowsing.js", () => ({ checkBlacklist: vi.fn() }));
vi.mock("../../services/verdict.js", () => ({ generateVerdict: vi.fn(), scoreBucket: () => "safe" }));

const { indicatorsRouter } = await import("./indicators.routes.js");

// Tiny app: inject a chosen user, then mount the REAL router. requireAuth runs in
// dev-stub mode (see test/setup.js) and preserves an already-set req.user, so this
// lets us drive the requireAnalyst guard with any role we choose.
const appAs = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/indicators", indicatorsRouter);
  return app;
}

describe("PATCH /api/indicators/:id/review (route guard)", () => {
  beforeEach(() => {
    orgReviewUpsert.mockClear();
    submissionFindMany.mockClear();
    notificationCreate.mockClear();
  });

  it("403 for a non-analyst (member) — requireAnalyst blocks the write", async () => {
    const res = await request(appAs({ id: 3, role: "member", orgId: 2 }))
      .patch("/api/indicators/10/review")
      .send({ reviewStatus: "confirmed malicious" });

    expect(res.status).toBe(403);
    expect(orgReviewUpsert).not.toHaveBeenCalled(); // never reached the handler
  });

  it("200 for an analyst — saves the review and returns it", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 2 }))
      .patch("/api/indicators/10/review")
      .send({ humanScore: 18, humanVerdict: "Fake login.", reviewStatus: "confirmed malicious", sharedWithOrg: true });

    expect(res.status).toBe(200);
    expect(orgReviewUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_indicatorId: { orgId: 2, indicatorId: 10 } },
        create: expect.objectContaining({ reviewStatus: "confirmed malicious", reviewedBy: 7 }),
      })
    );
    expect(res.body.orgReview.reviewStatus).toBe("confirmed malicious");
  });

  it("400 for an invalid reviewStatus", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 2 }))
      .patch("/api/indicators/10/review")
      .send({ reviewStatus: "not a real status" });

    expect(res.status).toBe(400);
    expect(orgReviewUpsert).not.toHaveBeenCalled();
  });
});
