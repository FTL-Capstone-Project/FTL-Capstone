import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared Prisma client so reportIndicator is tested without a live DB.
const findUnique = vi.fn();
const update = vi.fn();
vi.mock("../../db.js", () => ({ prisma: { indicator: { findUnique: (...a) => findUnique(...a), update: (...a) => update(...a) } } }));
// The service module also imports these; stub so importing it doesn't touch the network.
vi.mock("../../services/urlscan.js", () => ({ scanUrl: vi.fn() }));
vi.mock("../../services/safeBrowsing.js", () => ({ checkBlacklist: vi.fn() }));
vi.mock("../../services/verdict.js", () => ({ generateVerdict: vi.fn(), scoreBucket: () => "safe" }));

const { reportIndicator } = await import("./indicators.service.js");

describe("reportIndicator (Report it → global review)", () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); });

  it("returns null when the indicator doesn't exist", async () => {
    findUnique.mockResolvedValue(null);
    expect(await reportIndicator(999)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("flags an un-reviewed indicator as 'pending review' and bumps the count", async () => {
    findUnique.mockResolvedValue({ id: 1, globalReviewStatus: null, reportedCount: 0 });
    update.mockResolvedValue({ globalReviewStatus: "pending review", reportedCount: 1 });
    const res = await reportIndicator(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ reportedCount: { increment: 1 }, globalReviewStatus: "pending review" }),
    }));
    expect(res).toEqual({ global_review_status: "pending review", reported_count: 1 });
  });

  it("does NOT reopen an already-resolved indicator, but still counts the report", async () => {
    findUnique.mockResolvedValue({ id: 2, globalReviewStatus: "confirmed safe", reportedCount: 3 });
    update.mockResolvedValue({ globalReviewStatus: "confirmed safe", reportedCount: 4 });
    await reportIndicator(2);
    const dataArg = update.mock.calls[0][0].data;
    expect(dataArg).toHaveProperty("reportedCount");           // count still bumped
    expect(dataArg).not.toHaveProperty("globalReviewStatus");  // status NOT reset
  });

  it("never changes the AI verdict/score (a report is a request for review, not a re-score)", async () => {
    findUnique.mockResolvedValue({ id: 3, globalReviewStatus: null, reportedCount: 0, aiScore: 82 });
    update.mockResolvedValue({ globalReviewStatus: "pending review", reportedCount: 1 });
    await reportIndicator(3);
    const dataArg = update.mock.calls[0][0].data;
    expect(dataArg).not.toHaveProperty("aiScore");
    expect(dataArg).not.toHaveProperty("aiVerdict");
  });
});
