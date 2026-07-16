import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB module the service imports (module-level prisma), so no live
// Postgres is needed. Each test sets what these fns return.
const submissionFindMany = vi.fn();
const notificationFindMany = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    submission: { findMany: (...a) => submissionFindMany(...a) },
    notification: { findMany: (...a) => notificationFindMany(...a) },
  },
}));

// Import AFTER the mock is registered.
const { getDashboard } = await import("./dashboard.service.js");

// Build a submission joined with its indicator. `daysBack` is relative to "now"
// so the week/history windows are deterministic no matter when the test runs.
// scoreBucket bands (from services/verdict.js): >=70 safe, >=35 review, <35 dangerous.
const at = (daysBack) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0); // midday so day-bucketing is stable
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}
const sub = ({ indicatorId, aiScore, daysBack, status = "done", domain = "example.com" }) => ({
  id: indicatorId * 100 + daysBack,
  indicatorId,
  rawUrl: `https://${domain}/${indicatorId}`,
  createdAt: at(daysBack),
  indicator: { id: indicatorId, aiScore, aiTitle: `Title ${indicatorId}`, aiDescription: "d", domain, status },
});

beforeEach(() => {
  submissionFindMany.mockReset();
  notificationFindMany.mockReset();
  notificationFindMany.mockResolvedValue([]); // default: no notifications
});

describe("getDashboard", () => {
  it("returns an all-zero/empty shape for a user with no submissions", async () => {
    submissionFindMany.mockResolvedValue([]);

    const d = await getDashboard(1);

    expect(d.stats.checksThisWeek.value).toBe(0);
    expect(d.stats.threatsFound.value).toBe(0);
    expect(d.stats.safetyScore).toBeNull(); // no scored checks → null (empty state)
    expect(d.stats.checksRemaining).toEqual({ used: 0, limit: 50 });
    expect(d.results).toEqual({ safe: 0, suspicious: 0, dangerous: 0, total: 0 });
    expect(d.recentSubmissions).toEqual([]);
    expect(d.activity).toEqual([]);
    // Submission history always has one bucket per day for the 30-day window.
    expect(d.submissionHistory).toHaveLength(30);
    expect(d.submissionHistory.every((b) => b.count === 0)).toBe(true);
  });

  it("counts checks this week and buckets results by verdict band", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ indicatorId: 1, aiScore: 91, daysBack: 1 }),  // safe, this week
      sub({ indicatorId: 2, aiScore: 54, daysBack: 2 }),  // review/suspicious, this week
      sub({ indicatorId: 3, aiScore: 12, daysBack: 3 }),  // dangerous, this week
      sub({ indicatorId: 4, aiScore: 80, daysBack: 20 }), // safe, older than a week
    ]);

    const d = await getDashboard(1);

    expect(d.stats.checksThisWeek.value).toBe(3); // 3 within the last 7 days
    expect(d.stats.threatsFound.value).toBe(1);   // one dangerous this week
    // Donut counts all four unique checks.
    expect(d.results).toEqual({ safe: 2, suspicious: 1, dangerous: 1, total: 4 });
    // Average of 91,54,12,80 = 59 (rounded).
    expect(d.stats.safetyScore).toBe(59);
  });

  it("dedups repeated checks of the same indicator (one result, newest kept)", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ indicatorId: 1, aiScore: 91, daysBack: 1 }), // newest
      sub({ indicatorId: 1, aiScore: 91, daysBack: 5 }), // same indicator, older
    ]);

    const d = await getDashboard(1);

    expect(d.results.total).toBe(1);          // one unique indicator
    expect(d.recentSubmissions).toHaveLength(1);
  });

  it("caps recent submissions at 4 (latest unique checks)", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ indicatorId: 1, aiScore: 90, daysBack: 1 }),
      sub({ indicatorId: 2, aiScore: 90, daysBack: 2 }),
      sub({ indicatorId: 3, aiScore: 90, daysBack: 3 }),
      sub({ indicatorId: 4, aiScore: 90, daysBack: 4 }),
      sub({ indicatorId: 5, aiScore: 90, daysBack: 5 }),
    ]);

    const d = await getDashboard(1);

    expect(d.recentSubmissions).toHaveLength(4);
    expect(d.recentSubmissions[0]).toMatchObject({ indicatorId: 1, kind: "safe", title: "Title 1" });
  });

  it("merges submissions + notifications into the activity feed, newest first, capped at 6", async () => {
    submissionFindMany.mockResolvedValue([
      sub({ indicatorId: 1, aiScore: 90, daysBack: 1 }),
      sub({ indicatorId: 2, aiScore: 90, daysBack: 3 }),
    ]);
    notificationFindMany.mockResolvedValue([
      { id: 1, message: "Analyst confirmed a scam", createdAt: at(2) },
    ]);

    const d = await getDashboard(1);

    expect(d.activity).toHaveLength(3);
    // Newest-first: submission(1d) > notification(2d) > submission(3d).
    expect(d.activity[0].kind).toBe("submission");
    expect(d.activity[1].kind).toBe("notification");
    expect(d.activity[1].subject).toBe("Analyst confirmed a scam");
    // The notification query is scoped to the caller and limited to 6.
    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1 }, take: 6 })
    );
  });
});
