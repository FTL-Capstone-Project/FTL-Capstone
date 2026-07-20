import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the vision LLM + env so no network/key is needed. visionJSON returns whatever the model
// "saw"; the deterministic scorer must own the resulting number regardless.
const env = { anthropicApiKey: "test-key", llmModel: "claude", urlscanApiKey: "" };
const visionJSON = vi.fn();
const visionText = vi.fn();

vi.mock("../../config/env.js", () => ({ env }));
vi.mock("../../services/llm.js", () => ({
  visionJSON: (...a) => visionJSON(...a),
  visionText: (...a) => visionText(...a),
}));

const { visionRouter } = await import("./vision.routes.js");

const app = () => {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = { id: 1, orgId: null }; next(); });
  a.use("/api/vision", visionRouter);
  return a;
};

const IMG = "data:image/png;base64,AAAA";

describe("POST /api/vision/extract — signal extraction + deterministic report", () => {
  beforeEach(() => {
    visionJSON.mockReset();
    env.anthropicApiKey = "test-key";
  });

  it("400 without a data:image URL", async () => {
    const res = await request(app()).post("/api/vision/extract").send({ imageDataUrl: "http://x/y.png" });
    expect(res.status).toBe(400);
    expect(visionJSON).not.toHaveBeenCalled();
  });

  it("503 when vision isn't configured (never fabricates a verdict)", async () => {
    env.anthropicApiKey = "";
    const res = await request(app()).post("/api/vision/extract").send({ imageDataUrl: IMG });
    expect(res.status).toBe(503);
    expect(visionJSON).not.toHaveBeenCalled();
  });

  it("scores a link-less phishing screenshot dangerous even if the model narrates 'safe'", async () => {
    // The classic gap: no URL, no email — just a message asking for a password. The model even
    // says it's fine; CODE must still score it dangerous from the observed signals.
    visionJSON.mockResolvedValue({
      isMessage: true,
      urls: [], emails: [],
      signals: ["credentials", "urgency", "generic_greeting"],
      verdict: "This appears to be a normal, safe login page.",
      title: "Normal login",
      summary: "an email saying your account is locked",
    });
    const res = await request(app()).post("/api/vision/extract").send({ imageDataUrl: IMG });
    expect(res.status).toBe(200);
    expect(res.body.report).toBeTruthy();
    expect(res.body.report.ai_score).toBeLessThanOrEqual(20);
    expect(res.body.report.ai_confidence).toBe("high");
    expect(res.body.report.isImageReport).toBe(true);
    expect(res.body.report.evidence[0].severity).toBe("dangerous");
  });

  it("an unrelated photo (isMessage false) gets no verdict card", async () => {
    visionJSON.mockResolvedValue({ isMessage: false, urls: [], emails: [], signals: [], summary: "a cat" });
    const res = await request(app()).post("/api/vision/extract").send({ imageDataUrl: IMG });
    expect(res.status).toBe(200);
    expect(res.body.report).toBeNull();
  });

  it("still returns urls/emails/summary for the existing extract callers (back-compat)", async () => {
    visionJSON.mockResolvedValue({
      isMessage: true,
      urls: ["http://evil.example/login"], emails: ["boss@company.com"],
      signals: [], summary: "an email with a link",
    });
    const res = await request(app()).post("/api/vision/extract").send({ imageDataUrl: IMG });
    expect(res.status).toBe(200);
    expect(res.body.urls).toEqual(["http://evil.example/login"]);
    expect(res.body.emails).toEqual(["boss@company.com"]);
    expect(res.body.summary).toBe("an email with a link");
  });

  it("502 when the vision call throws (honest failure, no fake verdict)", async () => {
    visionJSON.mockRejectedValue(new Error("gateway down"));
    const res = await request(app()).post("/api/vision/extract").send({ imageDataUrl: IMG });
    expect(res.status).toBe(502);
    expect(res.body.report).toBeUndefined();
  });
});
