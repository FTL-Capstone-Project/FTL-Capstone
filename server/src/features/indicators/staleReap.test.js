import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma so we control the indicator row + can assert the self-heal update fires.
// The reap uses a CONDITIONAL updateMany (re-checks status+age at write time) then re-reads,
// so the mock tracks how many rows the updateMany "matched" to prove the no-clobber guard.
const indicatorFindUnique = vi.fn();
const indicatorUpdateMany = vi.fn();
const orgReviewFindUnique = vi.fn();
const submissionFindFirst = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    indicator: {
      findUnique: (...a) => indicatorFindUnique(...a),
      updateMany: (...a) => indicatorUpdateMany(...a),
    },
    orgReview: { findUnique: (...a) => orgReviewFindUnique(...a) },
    submission: { findFirst: (...a) => submissionFindFirst(...a) },
  },
}));
vi.mock("../../services/urlscan.js", () => ({ scanUrl: vi.fn() }));
vi.mock("../../services/safeBrowsing.js", () => ({ checkBlacklist: vi.fn() }));
vi.mock("../../services/verdict.js", () => ({ generateVerdict: vi.fn(), scoreBucket: (s) => (s >= 70 ? "safe" : s >= 35 ? "review" : "dangerous") }));

const { readIndicatorForClient } = await import("./indicators.service.js");

const STALE_MS = 180_000;

// A base row we tweak per test: status + how long ago it last changed (updatedAt).
const rowStuckSince = (status, updatedAt, extra = {}) => ({
  id: 77, status, updatedAt, domain: "slow.example.com",
  aiScore: null, aiVerdict: null, aiConfidence: null, aiTitle: null, aiDescription: null,
  aiTags: [], aiReasons: [], screenshotUrl: null, finalUrl: null, finalHost: null,
  redirectedToDifferentHost: false, globalReviewStatus: null, reportedCount: 0, reportCount: 0,
  ...extra,
});

describe("readIndicatorForClient — self-heal a stuck scan", () => {
  beforeEach(() => {
    indicatorFindUnique.mockReset(); indicatorUpdateMany.mockReset();
    orgReviewFindUnique.mockReset(); submissionFindFirst.mockReset();
    orgReviewFindUnique.mockResolvedValue(null);
    submissionFindFirst.mockResolvedValue(null);
    indicatorUpdateMany.mockResolvedValue({ count: 1 }); // default: the row was still stuck → reaped
  });

  it("flips a pending row older than STALE_MS to error with a safe verdict", async () => {
    const old = new Date(Date.now() - STALE_MS - 5_000); // stuck well past the scan window
    // 1st read → stale pending row; 2nd read (after the reap) → the flipped error row.
    indicatorFindUnique
      .mockResolvedValueOnce(rowStuckSince("pending", old))
      .mockResolvedValueOnce(rowStuckSince("error", old, { aiVerdict: "couldn't check" }));

    const res = await readIndicatorForClient(77, { id: 2, orgId: null });

    expect(indicatorUpdateMany).toHaveBeenCalledOnce();
    expect(indicatorUpdateMany.mock.calls[0][0].data.status).toBe("error");
    // the conditional WHERE re-checks status + age so a just-finished scan isn't clobbered
    expect(indicatorUpdateMany.mock.calls[0][0].where.status.in).toEqual(["pending", "scanning"]);
    expect(res.status).toBe("error");
    expect(typeof res.ai_verdict).toBe("string");
    expect(res.ai_verdict.length).toBeGreaterThan(0);
  });

  it("also heals a scanning row that has gone stale", async () => {
    const old = new Date(Date.now() - STALE_MS - 1);
    indicatorFindUnique
      .mockResolvedValueOnce(rowStuckSince("scanning", old))
      .mockResolvedValueOnce(rowStuckSince("error", old, { aiVerdict: "couldn't check" }));

    const res = await readIndicatorForClient(77, { id: 2, orgId: null });

    expect(indicatorUpdateMany).toHaveBeenCalledOnce();
    expect(res.status).toBe("error");
  });

  it("does NOT clobber a verdict the pipeline finished during the race window", async () => {
    const old = new Date(Date.now() - STALE_MS - 5_000);
    // We saw a stale scanning row, but between our read and our write the pipeline committed a
    // real "done" verdict → updateMany matches 0 rows, and the re-read returns that real verdict.
    indicatorUpdateMany.mockResolvedValue({ count: 0 });
    indicatorFindUnique
      .mockResolvedValueOnce(rowStuckSince("scanning", old))
      .mockResolvedValueOnce(rowStuckSince("done", new Date(), { aiScore: 12, aiVerdict: "Dangerous — credential phishing" }));

    const res = await readIndicatorForClient(77, { id: 2, orgId: null });

    expect(indicatorUpdateMany).toHaveBeenCalledOnce();
    expect(res.status).toBe("done");
    expect(res.ai_score).toBe(12); // the real verdict survived, not the generic error
  });

  it("leaves a FRESH pending row alone (no update, still no verdict)", async () => {
    const recent = new Date(Date.now() - 5_000); // a scan that only just started
    indicatorFindUnique.mockResolvedValue(rowStuckSince("pending", recent));

    const res = await readIndicatorForClient(77, { id: 2, orgId: null });

    expect(indicatorUpdateMany).not.toHaveBeenCalled();
    expect(res.status).toBe("pending");
    expect(res.ai_verdict).toBeUndefined(); // pending → base shape, no verdict yet
  });

  it("never touches a done row, even an old one", async () => {
    const old = new Date(Date.now() - STALE_MS - 60_000);
    indicatorFindUnique.mockResolvedValue({ ...rowStuckSince("done", old), aiScore: 90, aiVerdict: "Looks safe." });

    const res = await readIndicatorForClient(77, { id: 2, orgId: null });

    expect(indicatorUpdateMany).not.toHaveBeenCalled();
    expect(res.status).toBe("done");
    expect(res.ai_score).toBe(90);
  });
});
