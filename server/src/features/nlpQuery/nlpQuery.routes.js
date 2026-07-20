// ── feature: nlp-query · owner: David ──
// POST /api/nlp-query — AI Feature B. Analyst-only. Body: { question }. Turns the
// question into a whitelisted, validated, parameterized query and returns { data, chartSpec }
// (or { fallback } when it can't be mapped). All the security lives in nlpQuery.service.js.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnalyst } from "../../middleware/requireAnalyst.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { prisma } from "../../db.js";
import { answerNlpQuery } from "./nlpQuery.service.js";
import { env } from "../../config/env.js";

export const nlpQueryRouter = Router();

// Each query makes a Claude call — cap per user (denial-of-wallet).
const limit = rateLimit({ windowMs: 60_000, max: 20 });
const MAX_QUESTION = 2000;

nlpQueryRouter.post("/", requireAuth, requireAnalyst, limit, async (req, res) => {
  const { question } = req.body ?? {};
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "A question is required" });
  }
  if (question.length > MAX_QUESTION) {
    return res.status(400).json({ error: "That question is too long — please shorten it." });
  }
  if (!env.anthropicApiKey) return res.status(503).json({ error: "Insights are not configured" });
  try {
    const result = await answerNlpQuery(prisma, question.trim());
    return res.json(result); // { data, chartSpec } | { fallback }
  } catch (e) {
    console.warn("⚠ nlp-query failed:", e.message);
    return res.status(502).json({ error: "Couldn't run that query just now." });
  }
});
