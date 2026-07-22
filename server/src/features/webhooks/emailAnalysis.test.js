import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM (chatJSON) + env; use the REAL scorer (buildImageReport/SIGNAL_CATALOG) so the
// tests lock in the deterministic scoring end to end.
const env = { llmApiKey: "test-key" };
const chatJSON = vi.fn();

vi.mock("../../config/env.js", () => ({ env }));
vi.mock("../../services/llm.js", () => ({ chatJSON: (...a) => chatJSON(...a) }));

const { combineEmailScore, combineEmailReports, analyzeEmailBody } = await import("./emailAnalysis.js");

beforeEach(() => {
  chatJSON.mockReset();
  env.llmApiKey = "test-key";
});

describe("combineEmailScore (worst-of)", () => {
  it("returns the minimum of the present scores", () => {
    expect(combineEmailScore([80, 40, 95])).toBe(40);
  });
  it("ignores nulls/undefined (a leg we couldn't score)", () => {
    expect(combineEmailScore([null, 70, undefined])).toBe(70);
  });
  it("returns null when nothing was scorable", () => {
    expect(combineEmailScore([null, undefined])).toBeNull();
  });
});

describe("combineEmailReports (merge sender + body + link)", () => {
  it("takes the worst-of score and leads with the most dangerous leg's words", () => {
    const sender = { ai_score: 60, ai_verdict: "Free webmail sender.", ai_confidence: "medium", title: "Webmail sender", tags: ["Free webmail"], evidence: [{ text: "free webmail", severity: "review" }] };
    const body = { ai_score: 15, ai_verdict: "Asks for your password.", ai_confidence: "high", title: "Credential phishing", tags: ["Phishing"], evidence: [{ text: "asks for password", severity: "dangerous" }] };
    const link = { ai_score: 40, ai_verdict: "Suspicious link.", ai_confidence: "medium", title: "Suspicious link", tags: ["Suspicious"], evidence: [{ text: "new domain", severity: "review" }] };
    const r = combineEmailReports({ sender, body, link });
    expect(r.ai_score).toBe(15);                       // worst-of
    expect(r.ai_verdict).toBe("Asks for your password."); // most dangerous leg leads
    expect(r.ai_confidence).toBe("high");              // any high leg → high
    expect(r.evidence).toHaveLength(3);                // rows concatenated
    expect(r.tags).toEqual(expect.arrayContaining(["Free webmail", "Phishing", "Suspicious"]));
  });

  it("handles a link-less email (only sender + body legs present)", () => {
    const sender = { ai_score: 55, ai_verdict: "Unknown sender.", evidence: [] };
    const body = { ai_score: 20, ai_verdict: "Urgent password request.", evidence: [{ text: "urgency", severity: "review" }] };
    const r = combineEmailReports({ sender, body, link: null });
    expect(r.ai_score).toBe(20);
    expect(r.ai_verdict).toBe("Urgent password request.");
  });

  it("never returns empty evidence (card is never blank)", () => {
    const r = combineEmailReports({ sender: { ai_score: 90, evidence: [] }, body: null, link: null });
    expect(r.evidence.length).toBeGreaterThan(0);
  });
});

describe("analyzeEmailBody", () => {
  it("returns null (no throw) when the LLM key isn't configured", async () => {
    env.llmApiKey = "";
    const report = await analyzeEmailBody({ body: "confirm your password" });
    expect(report).toBeNull();
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it("scores observed red flags deterministically (crown-jewel → dangerous ceiling)", async () => {
    chatJSON.mockResolvedValue({ signals: ["credentials", "urgency"], verdict: "Looks like phishing.", title: "Fake login" });
    const report = await analyzeEmailBody({ from: "x@y.com", subject: "locked", body: "confirm your password now" });
    expect(report.ai_score).toBeLessThanOrEqual(20); // crown-jewel ceiling
    expect(report.ai_verdict).toBe("Looks like phishing.");
    expect(report.evidence.length).toBeGreaterThan(0);
  });

  it("returns null (non-fatal) when the LLM call throws", async () => {
    chatJSON.mockRejectedValue(new Error("gateway 500"));
    expect(await analyzeEmailBody({ body: "hello" })).toBeNull();
  });

  it("only sends signal keys from the closed catalog in the prompt", async () => {
    chatJSON.mockResolvedValue({ signals: [], verdict: "Clean.", title: "Clean" });
    await analyzeEmailBody({ body: "hi" });
    const prompt = chatJSON.mock.calls[0][0].user;
    expect(prompt).toContain("credentials");
    expect(prompt).toContain("urgency");
  });
});
