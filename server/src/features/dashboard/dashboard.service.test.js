// ── feature: dashboard · service test · owner: Michael ──
// Guards the "counts must agree" contract: the "My Checks This Week" tile and the
// "My Results" donut both count UNIQUE indicators (deduped), so re-checking the same
// link can never make the tile disagree with the donut. This is a regression test for
// the "tile says 2, chart shows 1" bug.
import { describe, it, expect, vi, beforeEach } from "vitest";

const submissionFindMany = vi.fn();
const notificationFindMany = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    submission: { findMany: (...a) => submissionFindMany(...a) },
    notification: { findMany: (...a) => notificationFindMany(...a) },
  },
}));

const { getDashboard } = await import("./dashboard.service.js");

// A submission joined with its indicator, like the service includes.
const sub = (indicatorId, aiScore, createdAt, source = "web") => ({
  indicatorId,
  rawUrl: `https://ex.com/${indicatorId}`,
  source,
  createdAt: new Date(createdAt),
  indicator: {
    id: indicatorId, aiScore, aiTitle: `t${indicatorId}`, aiTags: [], status: "done",
    blacklistHit: false, redirectedToDifferentHost: false, domainAgeDays: null,
  },
});

beforeEach(() => {
  submissionFindMany.mockReset();
  notificationFindMany.mockReset();
  notificationFindMany.mockResolvedValue([]);
});

describe("getDashboard — checks tile agrees with the results donut", () => {
  it("dedups re-checks: 3 submissions of 2 unique links → tile counts 2, donut totals 2", async () => {
    const today = new Date().toISOString();
    submissionFindMany.mockResolvedValue([
      sub(10, 20, today),        // dangerous
      sub(10, 20, today),        // SAME link re-checked → must NOT double-count
      sub(11, 95, today),        // safe
    ]);

    const { stats, results } = await getDashboard(1);

    // The bug was checksThisWeek counting raw submissions (3) while the donut counted
    // unique indicators (2). They must match now.
    expect(stats.checksThisWeek.value).toBe(2);
    expect(results.total).toBe(2);
    expect(stats.checksThisWeek.value).toBe(results.total);
    // Donut bands reflect the 2 unique links.
    expect(results.dangerous).toBe(1);
    expect(results.safe).toBe(1);
  });
});
