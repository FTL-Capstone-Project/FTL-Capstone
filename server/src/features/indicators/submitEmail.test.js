import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma + the analysis collaborators so submitEmail's SYNCHRONOUS writes can be asserted
// with no DB and no real LLM/scan (the background runEmailPipeline is fire-and-forget).
const indicatorFindUnique = vi.fn();
const indicatorCreate = vi.fn();
const indicatorUpdate = vi.fn();
const submissionCreate = vi.fn();
const userUpsert = vi.fn();
const $transaction = vi.fn(async (ops) => Promise.all(ops));
const escalateSubmission = vi.fn();

vi.mock("../../db.js", () => ({
  prisma: {
    indicator: { findUnique: (...a) => indicatorFindUnique(...a), create: (...a) => indicatorCreate(...a), update: (...a) => indicatorUpdate(...a) },
    submission: { create: (...a) => submissionCreate(...a) },
    user: { upsert: (...a) => userUpsert(...a) },
    $transaction: (...a) => $transaction(...a),
  },
}));
vi.mock("../../services/urlscan.js", () => ({ scanUrl: vi.fn() }));
vi.mock("../../services/safeBrowsing.js", () => ({ checkBlacklist: vi.fn() }));
vi.mock("../../services/verdict.js", () => ({ generateVerdict: vi.fn(), scoreBucket: (s) => (s >= 70 ? "safe" : s >= 35 ? "review" : "dangerous") }));
vi.mock("../submissions/submissions.service.js", () => ({ escalateSubmission: (...a) => escalateSubmission(...a) }));
// Neutralize the background analysis legs so the fire-and-forget pipeline does nothing real.
vi.mock("../askOrbo/senderReport.js", () => ({ generateSenderReport: vi.fn().mockResolvedValue(null) }));
vi.mock("../webhooks/emailAnalysis.js", () => ({
  analyzeEmailBody: vi.fn().mockResolvedValue(null),
  combineEmailReports: vi.fn().mockReturnValue({ ai_score: null, ai_verdict: "x", ai_confidence: "low", title: "x", tags: [], evidence: [] }),
  combineLinkReports: vi.fn().mockReturnValue(null),
}));

const { submitEmail } = await import("./indicators.service.js");

const orgUser = { id: 3, clerkUserId: "user_x", orgId: 7 };
const individual = { id: 4, clerkUserId: "user_y", orgId: null };

describe("submitEmail — a forwarded email becomes ONE reviewable Indicator", () => {
  beforeEach(() => {
    [indicatorFindUnique, indicatorCreate, indicatorUpdate, submissionCreate, userUpsert, escalateSubmission].forEach((m) => m.mockReset());
    userUpsert.mockResolvedValue({ id: 3, orgId: 7 });
    submissionCreate.mockResolvedValue({ id: 99 });
    indicatorUpdate.mockResolvedValue({ id: 87 });
    escalateSubmission.mockResolvedValue({});
  });

  it("creates a PENDING indicator keyed by email:<hash> + a Submission (source email)", async () => {
    indicatorFindUnique.mockResolvedValue(null); // new email
    indicatorCreate.mockResolvedValue({ id: 87, status: "pending" });

    const out = await submitEmail({ from: "David M. <david@acme.com>", subject: "Fwd: locked", body: "confirm your password", hasLink: false, user: orgUser });

    expect(out.indicatorId).toBe(87);
    const created = indicatorCreate.mock.calls[0][0].data;
    expect(created.canonicalKey).toMatch(/^email:[0-9a-f]{40}$/); // namespaced content hash
    expect(created.status).toBe("pending");                        // verdict fills in background
    expect(created.domain).toBe("acme.com");
    const sub = submissionCreate.mock.calls[0][0].data;
    expect(sub.source).toBe("email");
    expect(sub.rawUrl).toBe("david@acme.com"); // sender address (lowercased)
    expect(sub.indicatorId).toBe(87);
  });

  it("auto-escalates an org member (enters the analyst triage queue)", async () => {
    indicatorFindUnique.mockResolvedValue(null);
    indicatorCreate.mockResolvedValue({ id: 87, status: "pending" });

    const out = await submitEmail({ from: "david@acme.com", subject: "", body: "text scam", hasLink: false, user: orgUser });

    expect(escalateSubmission).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ submissionId: 99, orgId: 7, indicatorId: 87 })
    );
    expect(out.escalated).toBe(true);
  });

  it("does NOT escalate an individual (no org analyst)", async () => {
    userUpsert.mockResolvedValue({ id: 4, orgId: null });
    indicatorFindUnique.mockResolvedValue(null);
    indicatorCreate.mockResolvedValue({ id: 88, status: "pending" });

    const out = await submitEmail({ from: "sofia@example.com", subject: "", body: "text scam", hasLink: false, user: individual });

    expect(escalateSubmission).not.toHaveBeenCalled();
    expect(out.escalated).toBe(false);
  });

  it("re-forwarding the SAME email dedups (updates the existing indicator, no duplicate)", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 87, status: "done", canonicalKey: "email:abc" });

    const out = await submitEmail({ from: "david@acme.com", subject: "s", body: "b", hasLink: false, user: orgUser });

    expect(out.indicatorId).toBe(87);
    expect(indicatorCreate).not.toHaveBeenCalled(); // deduped — no second indicator
    expect(out.seenBefore).toBe(true);
  });
});
