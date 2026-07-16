import { describe, it, expect, vi } from "vitest";

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

const { generateSenderReport } = await import("./senderReport.js");

describe("generateSenderReport — deterministic domain backstop", () => {
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

  it("an unknown domain defers to the model's number", async () => {
    const r = await generateSenderReport({ email: "hello@some-random-startup.io" });
    expect(r.ai_score).toBe(90);        // model's number, unclamped
    expect(r.ai_confidence).toBe("medium");
  });

  it("same input yields the same score (reproducible)", async () => {
    const a = await generateSenderReport({ email: "security@paypa1-verify.net" });
    const b = await generateSenderReport({ email: "security@paypa1-verify.net" });
    expect(a.ai_score).toBe(b.ai_score);
  });
});
