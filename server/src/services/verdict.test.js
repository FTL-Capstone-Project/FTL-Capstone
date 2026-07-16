import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM so the deterministic rubric is tested WITHOUT a network call. chatJSON
// returns a fixed "words" object; the rubric owns the number regardless of what it says.
vi.mock("./llm.js", () => ({
  chatJSON: vi.fn(async () => ({
    score: 95,                         // deliberately optimistic — rubric must override/clamp
    title: "Looks fine",
    description: "Seems ok.",
    verdict: "Seems ok to me.",
    tags: ["Safe"],
    reasons: [{ text: "model reason", severity: "safe" }],
    confidence: "high",
  })),
}));

const { generateVerdict, scoreBucket } = await import("./verdict.js");
const llm = await import("./llm.js");

const base = { evidence: [], blacklist_hit: false, blacklist_source: null, domain_age_days: null, raw: {}, contextText: null };

describe("generateVerdict — deterministic rubric", () => {
  beforeEach(() => llm.chatJSON.mockClear());

  it("blacklist hit forces score <= 20 even when the model says 95", async () => {
    const v = await generateVerdict({ ...base, blacklist_hit: true, blacklist_source: "google_safe_browsing:SOCIAL_ENGINEERING" });
    expect(v.ai_score).toBeLessThanOrEqual(20);
    expect(scoreBucket(v.ai_score)).toBe("dangerous");
  });

  it("new domain (<7d) + credential form → dangerous bucket (hard ceiling)", async () => {
    const v = await generateVerdict({ ...base, domain_age_days: 3, evidence: [{ text: "login form present", severity: "review" }] });
    expect(v.ai_score).toBeLessThanOrEqual(20);
    expect(scoreBucket(v.ai_score)).toBe("dangerous");
  });

  it("confirmed brand impersonation (lookalike, no redirect to real brand) → dangerous", async () => {
    const v = await generateVerdict({ ...base, raw: { submitted_host: "arnazon.com", final_host: "arnazon.com", redirected_to_different_host: false } });
    expect(v.ai_score).toBeLessThanOrEqual(20);
  });

  it("clean established site → safe bucket", async () => {
    const v = await generateVerdict({ ...base, domain_age_days: 4000, evidence: [{ text: "No obvious red flags found", severity: "safe" }] });
    expect(scoreBucket(v.ai_score)).toBe("safe");
  });

  it("same input always yields the same score (reproducible)", async () => {
    const args = { ...base, domain_age_days: 20, raw: { malicious: false }, evidence: [{ text: "x", severity: "review" }] };
    const a = await generateVerdict(args);
    const b = await generateVerdict(args);
    expect(a.ai_score).toBe(b.ai_score);
  });

  it("the model cannot pull the score more than 15 off the rubric anchor", async () => {
    // rubric for a 20-day domain = 100 - 20 (domainUnder30) = 80; model says 95 → clamp to 80+15=95? no:
    // model 95 is within [80-15, 80+15] = [65, 95], so 95 is allowed. Use a case where it's clamped:
    // rubric for malicious urlscan = 100 - 55 = 45; model 95 must clamp to <= 60.
    const v = await generateVerdict({ ...base, raw: { malicious: true } });
    expect(v.ai_score).toBeLessThanOrEqual(60);
    expect(v.ai_score).toBeGreaterThanOrEqual(30);
  });

  it("confidence is high when two strong signals agree", async () => {
    const v = await generateVerdict({ ...base, blacklist_hit: true, domain_age_days: 3 });
    expect(v.ai_confidence).toBe("high");
  });
});
