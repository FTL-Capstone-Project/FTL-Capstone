import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock everything the router reaches so no network / DB / LLM is needed.
//   env    — toggle the LLM key to test the "not configured" path.
//   chatText — the Claude call; return canned text or throw.
//   getIndicatorContext — the grounding lookup for a specific check.
//   generateSenderReport — used by the sibling /sender-report route (stub so import works).
const env = { anthropicApiKey: "test-key", llmModel: "claude" };
const chatText = vi.fn();
const getIndicatorContext = vi.fn();

vi.mock("../../config/env.js", () => ({ env }));
vi.mock("../../services/llm.js", () => ({ chatText: (...a) => chatText(...a) }));
vi.mock("../indicators/indicators.service.js", () => ({ getIndicatorContext: (...a) => getIndicatorContext(...a) }));
vi.mock("./senderReport.js", () => ({ generateSenderReport: vi.fn() }));

const { askOrboRouter } = await import("./askOrbo.routes.js");

// Tiny app that injects a signed-in user, then mounts the real router.
const app = () => {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = { id: 1, orgId: null }; next(); });
  a.use("/api/ask-orbo", askOrboRouter);
  return a;
};

describe("POST /api/ask-orbo (chat)", () => {
  beforeEach(() => {
    chatText.mockReset();
    getIndicatorContext.mockReset();
    env.anthropicApiKey = "test-key";
  });

  it("400 when the question is missing/blank", async () => {
    const res = await request(app()).post("/api/ask-orbo").send({ question: "   " });
    expect(res.status).toBe(400);
    expect(chatText).not.toHaveBeenCalled();
  });

  it("503 when the LLM key isn't configured (never fakes an answer)", async () => {
    env.anthropicApiKey = "";
    const res = await request(app()).post("/api/ask-orbo").send({ question: "is this a scam?" });
    expect(res.status).toBe(503);
    expect(chatText).not.toHaveBeenCalled();
  });

  it("returns Claude's answer text on a valid question", async () => {
    chatText.mockResolvedValue("Here's how to spot that scam.");
    const res = await request(app()).post("/api/ask-orbo").send({ question: "how do I spot phishing?" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe("Here's how to spot that scam.");
    expect(chatText).toHaveBeenCalledOnce();
  });

  it("pulls grounding context when an indicatorId is supplied", async () => {
    getIndicatorContext.mockResolvedValue({ title: "Fake PayPal", verdict: "dangerous", score: 8 });
    chatText.mockResolvedValue("That check was dangerous because...");
    const res = await request(app()).post("/api/ask-orbo").send({ question: "why is it dangerous?", indicatorId: 42 });
    expect(res.status).toBe(200);
    expect(getIndicatorContext).toHaveBeenCalledWith(42);
    // the grounded context should be folded into the prompt sent to Claude
    const userPrompt = chatText.mock.calls[0][0].user;
    expect(userPrompt).toContain("Fake PayPal");
  });

  it("does NOT look up context when no indicatorId is given", async () => {
    chatText.mockResolvedValue("General safety tips: ...");
    await request(app()).post("/api/ask-orbo").send({ question: "general tips?" });
    expect(getIndicatorContext).not.toHaveBeenCalled();
  });

  it("502 when the Claude call fails (honest failure, no fabricated answer)", async () => {
    chatText.mockRejectedValue(new Error("gateway 500"));
    const res = await request(app()).post("/api/ask-orbo").send({ question: "is paypal.com safe?" });
    expect(res.status).toBe(502);
    expect(res.body.answer).toBeUndefined();
  });

  it("keeps Orbo scoped to security — the system prompt carries the scope + current-question rules", async () => {
    chatText.mockResolvedValue("ok");
    await request(app()).post("/api/ask-orbo").send({ question: "what's the weather?" });
    const system = chatText.mock.calls[0][0].system.toLowerCase();
    expect(system).toContain("scope"); // scope rule present
    expect(system).toMatch(/security|scam|phishing/); // stays on-topic
  });
});
