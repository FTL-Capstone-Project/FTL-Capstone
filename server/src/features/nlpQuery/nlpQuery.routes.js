// ── feature: nlp-query · owner: David · LLM-first rearchitecture by Michael ──
// POST /api/nlp-query — AI Feature B. Body: { question }. The LLM reads a data catalog and proposes
// a plan; the service validates it against that catalog and runs a parameterized, org-scoped query,
// returning { data, chartSpec } (or { fallback } when it's off-topic / the LLM is down). All the
// security lives in nlpQuery.service.js (catalog = the whitelist).
//
// ACCESS: any authenticated user IN AN ORG (member or analyst) — this powers the dashboard's
// "ask for data" sidebar. Individuals (no org) have no team data to query and no sidebar, so they
// get 403. The service enforces a per-ROLE visibility gate: an analyst sees all org data; a member
// sees only their own submissions + analyst-shared reviews (same gate as Team History). So opening
// this to members does NOT widen what a member can see — it just lets them ask for it in words.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { prisma } from "../../db.js";
import { answerNlpQuery } from "./nlpQuery.service.js";
import { env } from "../../config/env.js";

export const nlpQueryRouter = Router();

// Each query makes an LLM call — cap per user (denial-of-wallet).
const limit = rateLimit({ windowMs: 60_000, max: 20 });
const MAX_QUESTION = 2000;

nlpQueryRouter.post("/", requireAuth, limit, async (req, res) => {
  const { question } = req.body ?? {};
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "A question is required" });
  }
  if (question.length > MAX_QUESTION) {
    return res.status(400).json({ error: "That question is too long — please shorten it." });
  }
  // Individuals (no org) have no team data to query — reject rather than run an unscoped read.
  if (!req.user.orgId) {
    return res.status(403).json({ error: "Data queries are for organization members." });
  }
  // This is now LLM-first (no keyword fallback), so without an LLM key there's nothing to answer
  // with — say so honestly instead of pretending. The client shows this as a chat message.
  if (!env.llmApiKey) {
    return res.json({ fallback: "Orbo's data assistant isn't configured on this deployment yet." });
  }
  try {
    // The scope narrows every read to what THIS caller may see (story #12 + member privacy gate):
    // analyst → all org data; member → own submissions + analyst-shared reviews only.
    const scope = { orgId: req.user.orgId, userId: req.user.id, role: req.user.role };
    const result = await answerNlpQuery(prisma, question.trim(), scope);
    return res.json(result); // { data, chartSpec } | { fallback }
  } catch (e) {
    console.warn("⚠ nlp-query failed:", e.message);
    return res.status(502).json({ error: "Couldn't run that query just now." });
  }
});
