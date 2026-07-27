// ── prescreen content-aware email endpoint · owner: David ──
// POST /api/prescreen/email reads sender+subject+body (via the forwarded-email analysis) so the
// Gmail auto-scan badge reflects a REAL scam verdict, not just structural checks. Tests: it maps
// the combined 0-100 score to the badge's safe/warning/danger level, validates input, and 503s
// (so the client falls back to the instant check) when no LLM key is configured.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Control the LLM-key flag + urlscan key (gates the link leg) per test.
const env = { llmApiKey: "test-key", urlscanApiKey: "test-urlscan-key" };
vi.mock("../../config/env.js", () => ({ env }));

// Mock the analysis legs so tests are fast + deterministic (no real LLM call). We provide a small
// real-equivalent combineEmailReports (worst-of score + concatenated evidence) so the endpoint's
// score→level mapping is genuinely exercised. NOTE: the real combineEmailReports is a *reconciled*
// worst-of (it can round a lone 65-69 leg up to 70) — a plain min is a faithful stand-in only for
// the leg scores used below, which are all either clearly safe or clearly dangerous. The reconcile
// rules themselves are covered by emailAnalysis.test.js; here we're testing the route's wiring.
const analyzeEmailBody = vi.fn();
const generateSenderReport = vi.fn();
const scanLinkForReport = vi.fn();
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
// A small real-equivalent of combineLinkReports: worst-of the scanned links, or null if none scored.
const combineLinkReports = (linkScans = []) => {
  const scored = linkScans.filter((l) => l?.report && typeof l.report.ai_score === "number");
  if (!scored.length) return null;
  const worst = [...scored].sort((a, b) => a.report.ai_score - b.report.ai_score)[0];
  return { ai_score: worst.report.ai_score, title: worst.report.title ?? "Link check", evidence: worst.report.evidence ?? [] };
};
vi.mock("../webhooks/emailAnalysis.js", () => ({
  analyzeEmailBody: (...a) => analyzeEmailBody(...a),
  combineEmailReports: (...a) => combineEmailReports(...a),
  combineLinkReports: (...a) => combineLinkReports(...a),
}));
vi.mock("../askOrbo/senderReport.js", () => ({ generateSenderReport: (...a) => generateSenderReport(...a) }));
// The link-scan leg — mocked so tests never touch urlscan/Safe Browsing.
vi.mock("../indicators/indicators.service.js", () => ({ scanLinkForReport: (...a) => scanLinkForReport(...a) }));
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
  env.urlscanApiKey = "test-urlscan-key";
  analyzeEmailBody.mockReset();
  generateSenderReport.mockReset();
  scanLinkForReport.mockReset();
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

  it("422 when every analysis leg returns nothing scorable", async () => {
    analyzeEmailBody.mockResolvedValue(null);
    generateSenderReport.mockResolvedValue(null);
    const res = await request(app).post("/api/prescreen/email").send({ sender: "x@y.com", body: "hi" });
    expect(res.status).toBe(422);
    expect(scanLinkForReport).not.toHaveBeenCalled(); // no urls sent → no scan
  });

  it("a malicious LINK drags a clean sender + clean body down to dangerous (worst-of)", async () => {
    // The whole point of the deep-scan leg: an email whose SENDER and WORDING look fine but that
    // hides a malicious link must still go RED. sender 90 + body 92 + link 8 → min = 8 → dangerous.
    generateSenderReport.mockResolvedValue({ ai_score: 90, evidence: [], tags: [] });
    analyzeEmailBody.mockResolvedValue({ ai_score: 92, title: "Clean-looking", evidence: [] });
    scanLinkForReport.mockResolvedValue({ ai_score: 8, title: "Malicious link", evidence: [{ text: "urlscan flagged this page as malicious", severity: "dangerous" }] });

    const res = await request(app).post("/api/prescreen/email")
      .send({ sender: "hello@fine-looking.com", subject: "Invoice", body: "Please see the attached invoice.", urls: ["http://evil.ru/verify"] });

    expect(res.status).toBe(200);
    expect(scanLinkForReport).toHaveBeenCalledWith("http://evil.ru/verify");
    expect(res.body.score).toBe(8);
    expect(res.body.level).toBe("dangerous");
    expect(res.body.reasons.some((r) => /malicious/i.test(r.text))).toBe(true);
  });

  it("a clean link leaves a clean email safe (worst-of doesn't drag it down)", async () => {
    generateSenderReport.mockResolvedValue({ ai_score: 90, evidence: [], tags: [] });
    analyzeEmailBody.mockResolvedValue({ ai_score: 92, title: "Newsletter", evidence: [] });
    scanLinkForReport.mockResolvedValue({ ai_score: 95, title: "Safe link", evidence: [] });

    const res = await request(app).post("/api/prescreen/email")
      .send({ sender: "news@company.com", body: "Weekly digest", urls: ["https://company.com/read"] });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(90); // min(90,92,95) — link doesn't lower it
    expect(res.body.level).toBe("safe");
  });

  it("dedupes + caps links at 5 before scanning (latency + quota guard)", async () => {
    generateSenderReport.mockResolvedValue({ ai_score: 90, evidence: [], tags: [] });
    analyzeEmailBody.mockResolvedValue({ ai_score: 92, evidence: [] });
    scanLinkForReport.mockResolvedValue({ ai_score: 95, evidence: [] });
    const urls = ["https://a.com", "https://a.com", "https://b.com", "https://c.com", "https://d.com", "https://e.com", "https://f.com"];
    const res = await request(app).post("/api/prescreen/email").send({ sender: "x@y.com", body: "hi", urls });
    expect(res.status).toBe(200);
    // 7 sent, 1 dup → 6 unique, capped to 5 scans.
    expect(scanLinkForReport).toHaveBeenCalledTimes(5);
  });

  it("skips the link leg entirely when urlscan isn't configured (no key → no scans)", async () => {
    env.urlscanApiKey = null;
    generateSenderReport.mockResolvedValue({ ai_score: 72, evidence: [], tags: [] });
    analyzeEmailBody.mockResolvedValue({ ai_score: 100, evidence: [] });
    const res = await request(app).post("/api/prescreen/email")
      .send({ sender: "x@y.com", body: "hi", urls: ["https://a.com"] });
    expect(res.status).toBe(200);
    expect(scanLinkForReport).not.toHaveBeenCalled(); // no urlscan key → link leg skipped
    expect(res.body.score).toBe(72); // sender+body only
  });

  it("a failed link scan is best-effort — the email still scores from sender + body", async () => {
    generateSenderReport.mockResolvedValue({ ai_score: 72, evidence: [], tags: [] });
    analyzeEmailBody.mockResolvedValue({ ai_score: 100, evidence: [] });
    scanLinkForReport.mockRejectedValue(new Error("urlscan submit 429"));
    const res = await request(app).post("/api/prescreen/email")
      .send({ sender: "x@y.com", body: "hi", urls: ["https://a.com"] });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(72); // link leg absent, not fatal
  });
});
