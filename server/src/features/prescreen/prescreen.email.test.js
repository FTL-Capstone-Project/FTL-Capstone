// ── prescreen content-aware email endpoint · owner: David ──
// POST /api/prescreen/email reads sender+subject+body (via the forwarded-email analysis) so the
// Gmail auto-scan badge reflects a REAL scam verdict, not just structural checks. Tests: it maps
// the combined 0-100 score to the badge's safe/warning/danger level, validates input, and 503s
// (so the client falls back to the instant check) when no LLM key is configured.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Control the LLM-key flag per test.
const env = { llmApiKey: "test-key" };
vi.mock("../../config/env.js", () => ({ env }));

// Mock the analysis legs so tests are fast + deterministic (no real LLM call). We provide a small
// real-equivalent combineEmailReports (worst-of score + concatenated evidence) so the endpoint's
// score→level mapping is genuinely exercised.
const analyzeEmailBody = vi.fn();
const generateSenderReport = vi.fn();
const combineEmailReports = ({ sender, body, link }) => {
  const legs = [sender, body, link].filter(Boolean);
  const scores = legs.map((l) => l.ai_score).filter((s) => typeof s === "number");
  const worst = [...legs].sort((a, b) => (a.ai_score ?? 100) - (b.ai_score ?? 100))[0] ?? null;
  return {
    ai_score: scores.length ? Math.min(...scores) : null,
    title: worst?.title ?? "Email",
    evidence: legs.flatMap((l) => l.evidence ?? []),
  };
};
vi.mock("../webhooks/emailAnalysis.js", () => ({
  analyzeEmailBody: (...a) => analyzeEmailBody(...a),
  combineEmailReports: (...a) => combineEmailReports(...a),
}));
vi.mock("../askOrbo/senderReport.js", () => ({ generateSenderReport: (...a) => generateSenderReport(...a) }));
// prescreen (instant) is also imported by the router; stub it so the module loads.
vi.mock("../../services/prescreen.js", () => ({ prescreen: vi.fn() }));
// Auth + rate-limit are pass-throughs here — we're testing the endpoint's logic, not the guards.
vi.mock("../../middleware/auth.js", () => ({ requireAuth: (req, _res, next) => { req.user = { id: 1 }; next(); } }));
vi.mock("../../middleware/rateLimit.js", () => ({ rateLimit: () => (_req, _res, next) => next() }));

const { prescreenRouter } = await import("./prescreen.routes.js");

const app = express();
app.use(express.json());
app.use("/api/prescreen", prescreenRouter);

beforeEach(() => {
  env.llmApiKey = "test-key";
  analyzeEmailBody.mockReset();
  generateSenderReport.mockReset();
});

describe("POST /api/prescreen/email (content-aware badge)", () => {
  it("a scam body → dangerous level (worst-of the analyzed legs)", async () => {
    analyzeEmailBody.mockResolvedValue({ ai_score: 10, ai_verdict: "Phishing.", title: "Fake bank alert", tags: [], evidence: [{ text: "asks for your password", severity: "dangerous" }] });
    generateSenderReport.mockResolvedValue({ ai_score: 40, evidence: [], tags: [] });

    const res = await request(app).post("/api/prescreen/email")
      .send({ sender: "no-reply@paypa1-secure.com", subject: "Account suspended", body: "Verify now or lose access." });

    expect(res.status).toBe(200);
    expect(res.body.level).toBe("dangerous"); // min(10,40)=10 → dangerous
    expect(res.body.score).toBe(10);
    expect(res.body.reasons[0].text).toMatch(/password/);
  });

  it("a clean marketing email → safe level", async () => {
    analyzeEmailBody.mockResolvedValue({ ai_score: 92, ai_verdict: "Looks like a legit promo.", title: "Rewards offer", tags: [], evidence: [] });
    generateSenderReport.mockResolvedValue({ ai_score: 90, evidence: [], tags: [] });

    const res = await request(app).post("/api/prescreen/email")
      .send({ sender: "offers@m.popeyes.com", subject: "Rewards", body: "Order now to earn rewards." });

    expect(res.status).toBe(200);
    expect(res.body.level).toBe("safe"); // min(92,90)=90 → safe
  });

  it("rejects an empty payload (400)", async () => {
    const res = await request(app).post("/api/prescreen/email").send({});
    expect(res.status).toBe(400);
    expect(analyzeEmailBody).not.toHaveBeenCalled();
  });

  it("503s when no LLM key, so the client falls back to the instant check", async () => {
    env.llmApiKey = null;
    const res = await request(app).post("/api/prescreen/email").send({ body: "hi" });
    expect(res.status).toBe(503);
    expect(analyzeEmailBody).not.toHaveBeenCalled();
  });

  it("422 when both analysis legs return nothing scorable", async () => {
    analyzeEmailBody.mockResolvedValue(null);
    generateSenderReport.mockResolvedValue(null);
    const res = await request(app).post("/api/prescreen/email").send({ sender: "x@y.com", body: "hi" });
    expect(res.status).toBe(422);
  });
});
