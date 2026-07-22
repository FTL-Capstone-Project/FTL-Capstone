// ── archive / delete My History · owner: David ── (per-user, indicator-safe)
// Drives the two write routes + the ?archived= read filter through the REAL router with a
// mocked Prisma, so no live Postgres is needed. The point of these tests: prove a caller can
// only ever touch THEIR OWN Submission rows (WHERE always pins userId), that a 0-row result is
// a 404 (IDOR-safe), and that the global Indicator is never written.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the DB the router imports. Each test sets what these return.
const submissionFindMany = vi.fn();
const submissionUpdateMany = vi.fn();
const submissionDeleteMany = vi.fn();
const orgReviewFindMany = vi.fn();
const indicatorUpdate = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    submission: {
      findMany: (...a) => submissionFindMany(...a),
      updateMany: (...a) => submissionUpdateMany(...a),
      deleteMany: (...a) => submissionDeleteMany(...a),
    },
    orgReview: { findMany: (...a) => orgReviewFindMany(...a) },
    // Present so we can assert it's NEVER called — deleting my history must not touch the
    // shared global indicator (its score / reportCount).
    indicator: { update: (...a) => indicatorUpdate(...a) },
  },
}));

const { historyRouter } = await import("./history.routes.js");

// Build a tiny app that injects a chosen user, then mounts the real router.
const appAs = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/history", historyRouter);
  return app;
}

// One fake submission joined with its indicator, like the route includes it.
const sub = ({ id, indicatorId, aiScore, name, createdAt }) => ({
  id,
  indicatorId,
  rawUrl: `https://example.com/${id}`,
  createdAt,
  indicator: { id: indicatorId, aiScore, aiTitle: `t${indicatorId}`, aiDescription: "d", aiTags: [], screenshotUrl: null },
  user: { name },
});

beforeEach(() => {
  submissionFindMany.mockReset();
  submissionUpdateMany.mockReset();
  submissionDeleteMany.mockReset();
  orgReviewFindMany.mockReset();
  indicatorUpdate.mockReset();
});

describe("GET /api/history?mine=1 archived filter", () => {
  it("default (no archived flag) → asks for ACTIVE rows only (archivedAt: null)", async () => {
    submissionFindMany.mockResolvedValue([]);
    const res = await request(appAs({ id: 5, orgId: null, name: "Solo" })).get("/api/history?mine=1");

    expect(res.status).toBe(200);
    expect(submissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 5, archivedAt: null } })
    );
  });

  it("?archived=1 → asks for ARCHIVED rows only (archivedAt not null)", async () => {
    submissionFindMany.mockResolvedValue([]);
    const res = await request(appAs({ id: 5, orgId: null, name: "Solo" })).get("/api/history?mine=1&archived=1");

    expect(res.status).toBe(200);
    // First call is the archived rows; a SECOND call fetches active indicator ids for the split guard.
    expect(submissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 5, archivedAt: { not: null } } })
    );
  });

  it("archived view EXCLUDES an indicator that also has a live submission (no split card)", async () => {
    // The user archived a link, then re-checked it → one archived row + one active row, same indicator.
    // The archived list must NOT show it (it belongs to Active), so the same card can't appear twice.
    submissionFindMany
      // 1) archived rows for this user
      .mockResolvedValueOnce([
        sub({ id: 1, indicatorId: 10, aiScore: 22, name: "Solo", createdAt: new Date("2026-07-08") }),
      ])
      // 2) active indicator ids (the split-card guard) — indicator 10 is ALSO active
      .mockResolvedValueOnce([{ indicatorId: 10 }]);

    const res = await request(appAs({ id: 5, orgId: null, name: "Solo" })).get("/api/history?mine=1&archived=1");

    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(0); // excluded — it's shown in Active instead
  });
});

describe("PATCH /api/history/:indicatorId/archive", () => {
  it("archives the caller's own rows (scoped to userId + indicatorId, sets a timestamp)", async () => {
    submissionUpdateMany.mockResolvedValue({ count: 1 });
    const res = await request(appAs({ id: 5, name: "Solo" }))
      .patch("/api/history/42/archive").send({ archived: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ archived: true, count: 1 });
    // The update is pinned to THIS user + indicator, and archivedAt is a real timestamp.
    const arg = submissionUpdateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 5, indicatorId: 42 });
    expect(arg.data.archivedAt).toBeInstanceOf(Date);
  });

  it("restore (archived:false) clears archivedAt back to null", async () => {
    submissionUpdateMany.mockResolvedValue({ count: 2 });
    const res = await request(appAs({ id: 5 }))
      .patch("/api/history/42/archive").send({ archived: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ archived: false, count: 2 });
    expect(submissionUpdateMany.mock.calls[0][0].data).toEqual({ archivedAt: null });
  });

  it("no body → defaults to archiving (archived: true)", async () => {
    submissionUpdateMany.mockResolvedValue({ count: 1 });
    const res = await request(appAs({ id: 5 })).patch("/api/history/42/archive");
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true);
  });

  it("0 rows changed → 404 (caller has nothing of theirs here; no existence leak)", async () => {
    submissionUpdateMany.mockResolvedValue({ count: 0 });
    const res = await request(appAs({ id: 5 }))
      .patch("/api/history/999/archive").send({ archived: true });
    expect(res.status).toBe(404);
  });

  it("a non-boolean `archived` is rejected (400) — a truthy string can't silently archive", async () => {
    const res = await request(appAs({ id: 5 }))
      .patch("/api/history/42/archive").send({ archived: "false" });
    expect(res.status).toBe(400);
    expect(submissionUpdateMany).not.toHaveBeenCalled();
  });

  it("a non-numeric indicator id → 400 (no query runs)", async () => {
    const res = await request(appAs({ id: 5 })).patch("/api/history/abc/archive").send({ archived: true });
    expect(res.status).toBe(400);
    expect(submissionUpdateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/history/:indicatorId", () => {
  it("individual: deletes the caller's own rows only, and never touches the global Indicator", async () => {
    submissionDeleteMany.mockResolvedValue({ count: 1 });
    const res = await request(appAs({ id: 5, orgId: null })).delete("/api/history/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 1 });
    // Scoped to this user + indicator.
    expect(submissionDeleteMany).toHaveBeenCalledWith({ where: { userId: 5, indicatorId: 42 } });
    // The shared indicator (score / reportCount) is left completely alone.
    expect(indicatorUpdate).not.toHaveBeenCalled();
  });

  it("org member: DELETE is forbidden (403) — they'd hide the indicator from the org's analyst queue", async () => {
    const res = await request(appAs({ id: 5, orgId: 99 })).delete("/api/history/42");
    expect(res.status).toBe(403);
    // Never runs the delete — the guard rejects before touching the DB.
    expect(submissionDeleteMany).not.toHaveBeenCalled();
  });

  it("0 rows deleted → 404 (nothing of the caller's for that indicator)", async () => {
    submissionDeleteMany.mockResolvedValue({ count: 0 });
    const res = await request(appAs({ id: 5, orgId: null })).delete("/api/history/999");
    expect(res.status).toBe(404);
  });

  it("a non-numeric indicator id → 400 (no delete runs)", async () => {
    const res = await request(appAs({ id: 5, orgId: null })).delete("/api/history/abc");
    expect(res.status).toBe(400);
    expect(submissionDeleteMany).not.toHaveBeenCalled();
  });
});
