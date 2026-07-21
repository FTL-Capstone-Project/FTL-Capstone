import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma so we can assert exactly what persistSenderReport writes, with no DB.
const indicatorFindUnique = vi.fn();
const indicatorCreate = vi.fn();
const indicatorUpdate = vi.fn();
const submissionCreate = vi.fn();
const userUpsert = vi.fn();
const $transaction = vi.fn(async (ops) => Promise.all(ops));

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
vi.mock("../submissions/submissions.service.js", () => ({ escalateSubmission: vi.fn() }));

const { persistSenderReport } = await import("./indicators.service.js");

const report = {
  ai_score: 5, ai_verdict: "Spoofed PayPal sender.", ai_confidence: "high",
  title: "Spoofed PayPal sender", tags: ["Impersonation"],
  evidence: [{ text: "lookalike of PayPal", severity: "dangerous" }],
};
const user = { id: 3, clerkUserId: "user_x", orgId: null };

describe("persistSenderReport — sender reports land in Reports/History", () => {
  beforeEach(() => {
    [indicatorFindUnique, indicatorCreate, indicatorUpdate, submissionCreate, userUpsert].forEach((m) => m.mockReset());
    userUpsert.mockResolvedValue({ id: 3, orgId: null });
    submissionCreate.mockResolvedValue({ id: 99 });
    indicatorUpdate.mockResolvedValue({ id: 87 });
  });

  it("creates a DONE indicator keyed by sender:<email> with the verdict fields", async () => {
    indicatorFindUnique.mockResolvedValue(null); // new sender
    indicatorCreate.mockResolvedValue({ id: 87 });

    const id = await persistSenderReport({ email: "Security@Paypa1-Verify.net", report, user });

    expect(id).toBe(87);
    const created = indicatorCreate.mock.calls[0][0].data;
    expect(created.canonicalKey).toBe("sender:security@paypa1-verify.net"); // lowercased, namespaced
    expect(created.domain).toBe("paypa1-verify.net");
    expect(created.status).toBe("done");        // synchronous — no scan phase
    expect(created.aiScore).toBe(5);
    expect(created.aiTitle).toBe("Spoofed PayPal sender");
    expect(created.aiReasons).toEqual(report.evidence);
  });

  it("writes a Submission with the email as rawUrl and source 'email'", async () => {
    indicatorFindUnique.mockResolvedValue(null);
    indicatorCreate.mockResolvedValue({ id: 87 });

    await persistSenderReport({ email: "foo@bar.com", report, user });

    const sub = submissionCreate.mock.calls[0][0].data;
    expect(sub.rawUrl).toBe("foo@bar.com");
    expect(sub.source).toBe("email");
    expect(sub.userId).toBe(3);
  });

  it("re-checking a known sender UPDATES the indicator (dedup), does not create a second", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 87, canonicalKey: "sender:foo@bar.com" });

    const id = await persistSenderReport({ email: "foo@bar.com", report, user });

    expect(id).toBe(87);
    expect(indicatorCreate).not.toHaveBeenCalled();  // no duplicate indicator
    expect(indicatorUpdate).toHaveBeenCalled();       // refreshed verdict instead
  });

  it("is best-effort: a DB failure returns null instead of throwing (never breaks the user's verdict)", async () => {
    indicatorFindUnique.mockRejectedValue(new Error("db down"));
    const id = await persistSenderReport({ email: "foo@bar.com", report, user });
    expect(id).toBeNull();
  });
});
