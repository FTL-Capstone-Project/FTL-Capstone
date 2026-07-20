import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM: it returns optimistic "Safe 90" words for EVERY sender. The deterministic
// domain backstop must override that for lookalikes (force dangerous) and floor real brand
// domains — proving code, not the model, makes the safe/dangerous call.
vi.mock("../../services/llm.js", () => ({
  chatJSON: vi.fn(async () => ({
    score: 90,
    title: "Looks legit",
    verdict: "Seems fine.",
    tags: ["Safe"],
    reasons: [{ text: "model said fine", severity: "safe" }],
    confidence: "medium",
  })),
}));

// Mock the DNS service so tests are offline + deterministic. Default: a healthy, fully-configured
// domain (no penalty) — individual tests override checkSenderDns for the negative paths.
const checkSenderDns = vi.fn(async () => ({
  checked: true, resolves: true, hasMx: true, hasSpf: true, hasDmarc: true,
  evidence: [{ text: "email authentication configured (MX, SPF, and DMARC)", severity: "safe" }], penalty: 0,
}));
vi.mock("../../services/senderDns.js", () => ({
  checkSenderDns: (...a) => checkSenderDns(...a),
  DNS_PENALTY_CAP: 30,
}));

const { generateSenderReport } = await import("./senderReport.js");

describe("generateSenderReport — deterministic domain backstop", () => {
  beforeEach(() => {
    // reset to the healthy default before each test (negative-path tests set their own)
    checkSenderDns.mockReset();
    checkSenderDns.mockResolvedValue({
      checked: true, resolves: true, hasMx: true, hasSpf: true, hasDmarc: true,
      evidence: [{ text: "email authentication configured (MX, SPF, and DMARC)", severity: "safe" }], penalty: 0,
    });
  });

  it("a lookalike domain is forced dangerous even when the model says Safe 90", async () => {
    const r = await generateSenderReport({ email: "security@paypa1-verify.net" });
    expect(r.ai_score).toBeLessThanOrEqual(20);
    expect(r.ai_confidence).toBe("high");
    expect(r.tags).toContain("Impersonation");
    expect(r.evidence[0].severity).toBe("dangerous");
  });

  it("a brand lookalike (linkedln.com) is caught as impersonation", async () => {
    const r = await generateSenderReport({ email: "billing@linkedln.com" });
    expect(r.ai_score).toBeLessThanOrEqual(20);
  });

  it("a real brand domain is not scored dangerous (floored to review+)", async () => {
    const r = await generateSenderReport({ email: "editors-noreply@linkedin.com" });
    expect(r.ai_score).toBeGreaterThanOrEqual(55);
    expect(r.ai_confidence).toBe("high");
    expect(r.evidence[0].severity).toBe("safe");
  });

  it("an unknown domain with healthy DNS defers to the model's number", async () => {
    const r = await generateSenderReport({ email: "hello@some-random-startup.io" });
    expect(r.ai_score).toBe(90);        // model's number, unclamped (no DNS penalty)
    expect(r.ai_confidence).toBe("medium");
  });

  it("a known-brand / lookalike domain skips the DNS lookup entirely (fast + decided)", async () => {
    await generateSenderReport({ email: "editors-noreply@linkedin.com" });   // brand
    await generateSenderReport({ email: "security@paypa1-verify.net" });     // lookalike
    expect(checkSenderDns).not.toHaveBeenCalled();
  });

  it("an unknown domain that doesn't resolve is pulled down and marked high-confidence", async () => {
    checkSenderDns.mockResolvedValue({
      checked: true, resolves: false, hasMx: false, hasSpf: false, hasDmarc: false,
      evidence: [{ text: "The domain \"ghostmail-xyz.co\" doesn't resolve on the internet", severity: "review" }],
      penalty: 30,
    });
    const r = await generateSenderReport({ email: "billing@ghostmail-xyz.co" });
    expect(r.ai_score).toBe(60);            // 90 - 30 penalty
    expect(r.ai_confidence).toBe("high");   // a hard DNS fact decided it
    expect(r.evidence[0].text).toMatch(/doesn't resolve/i);   // leads the "why"
  });

  it("missing mail-auth records on an unknown domain shave a capped penalty (soft nudge)", async () => {
    checkSenderDns.mockResolvedValue({
      checked: true, resolves: true, hasMx: false, hasSpf: false, hasDmarc: false,
      evidence: [
        { text: "no mail (MX) records", severity: "review" },
        { text: "no SPF record", severity: "review" },
        { text: "no DMARC policy", severity: "review" },
      ],
      penalty: 22,
    });
    const r = await generateSenderReport({ email: "noreply@fresh-lookalikeish.biz" });
    expect(r.ai_score).toBe(68);            // 90 - 22; a nudge, not a hard dangerous
    expect(r.ai_confidence).toBe("medium"); // resolves → still the model's confidence
  });

  it("same input yields the same score (reproducible)", async () => {
    const a = await generateSenderReport({ email: "security@paypa1-verify.net" });
    const b = await generateSenderReport({ email: "security@paypa1-verify.net" });
    expect(a.ai_score).toBe(b.ai_score);
  });
});
