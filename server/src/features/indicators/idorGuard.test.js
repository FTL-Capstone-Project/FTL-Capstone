import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma so we control the indicator row + whether a Submission exists for the caller.
const indicatorFindUnique = vi.fn();
const orgReviewFindUnique = vi.fn();
const submissionFindFirst = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    indicator: { findUnique: (...a) => indicatorFindUnique(...a) },
    orgReview: { findUnique: (...a) => orgReviewFindUnique(...a) },
    submission: { findFirst: (...a) => submissionFindFirst(...a) },
  },
}));
vi.mock("../../services/urlscan.js", () => ({ scanUrl: vi.fn() }));
vi.mock("../../services/safeBrowsing.js", () => ({ checkBlacklist: vi.fn() }));
vi.mock("../../services/verdict.js", () => ({ generateVerdict: vi.fn(), scoreBucket: (s) => (s >= 70 ? "safe" : s >= 35 ? "review" : "dangerous") }));

const { readIndicatorForClient } = await import("./indicators.service.js");

// A "done" indicator that carries the caller-sensitive destination fields.
const doneIndicator = {
  id: 457, status: "done", aiScore: 85, aiVerdict: "Looks safe.", aiConfidence: "high",
  aiTitle: "Legit", aiDescription: "ok", aiTags: [], aiReasons: [], domain: "intranet.acme.com",
  reportCount: 1, screenshotUrl: "https://urlscan.io/shot.png",
  finalUrl: "https://intranet.acme.com/reset?token=secret", finalHost: "intranet.acme.com",
  redirectedToDifferentHost: false, globalReviewStatus: null, reportedCount: 0,
};

describe("readIndicatorForClient — IDOR field gating", () => {
  beforeEach(() => {
    indicatorFindUnique.mockReset(); orgReviewFindUnique.mockReset(); submissionFindFirst.mockReset();
    indicatorFindUnique.mockResolvedValue(doneIndicator);
    orgReviewFindUnique.mockResolvedValue(null);
  });

  it("a NON-submitter gets the shared verdict but NOT the URL/host/screenshot", async () => {
    submissionFindFirst.mockResolvedValue(null); // caller never submitted this indicator
    const res = await readIndicatorForClient(457, { id: 2, orgId: null });
    // shared threat-intel is still returned
    expect(res.ai_score).toBe(85);
    expect(res.ai_verdict).toBe("Looks safe.");
    expect(res.domain).toBe("intranet.acme.com"); // domain is intentionally shared
    // caller-sensitive detail is withheld
    expect(res.final_url).toBeNull();
    expect(res.final_host).toBeNull();
    expect(res.screenshot_url).toBeNull();
    // the safe boolean is still shared (no hostname leak)
    expect(res.redirected_to_different_host).toBe(false);
  });

  it("the SUBMITTER gets the full detail (URL + host + screenshot)", async () => {
    submissionFindFirst.mockResolvedValue({ id: 10 }); // caller has a submission row
    const res = await readIndicatorForClient(457, { id: 2, orgId: null });
    expect(res.final_url).toBe("https://intranet.acme.com/reset?token=secret");
    expect(res.final_host).toBe("intranet.acme.com");
    expect(res.screenshot_url).toBe("https://urlscan.io/shot.png");
  });

  it("returns null for a missing indicator (no leak of existence detail)", async () => {
    indicatorFindUnique.mockResolvedValue(null);
    expect(await readIndicatorForClient(999, { id: 2, orgId: null })).toBeNull();
  });

  it("withholds the screenshot even on an error-status indicator for a non-submitter", async () => {
    indicatorFindUnique.mockResolvedValue({ ...doneIndicator, status: "error", aiVerdict: "couldn't check" });
    submissionFindFirst.mockResolvedValue(null);
    const res = await readIndicatorForClient(457, { id: 2, orgId: null });
    expect(res.screenshot_url).toBeNull();
  });
});
