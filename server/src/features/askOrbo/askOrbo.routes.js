// ── feature: ask-orbo · owner: David ──
// POST /api/ask-orbo — interactive follow-up Q&A about a checked link/scam.
// Orbo answers SECURITY/scam questions using the verdict context; politely declines
// off-topic questions (weather, jokes, general chit-chat).
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { env } from "../../config/env.js";
import { chatText } from "../../services/llm.js";
import { getIndicatorContext } from "../indicators/indicators.service.js";
import { generateSenderReport } from "./senderReport.js";

export const askOrboRouter = Router();

// Body: { indicatorId?, question, history?: [{role:'user'|'orbo', text}] }
// Resp: { answer }
askOrboRouter.post("/", requireAuth, async (req, res) => {
  const { indicatorId, question, history = [] } = req.body ?? {};
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "A question is required" });
  }
  if (!env.anthropicApiKey) return res.status(503).json({ error: "Orbo chat not configured" });

  // Pull the verdict context for this check (if any) so answers are grounded.
  let context = null;
  if (indicatorId != null) {
    context = await getIndicatorContext(Number(indicatorId)); // { title, verdict, score, confidence, tags, domain } | null
  }

  const system =
    "You are Orbo, a friendly cybersecurity assistant for a phishing-triage app. You help everyday people " +
    "understand scams, phishing, suspicious links/emails, and how to stay safe. " +
    "ANSWER THE CURRENT QUESTION: focus on the user's LATEST message. Earlier conversation is only for " +
    "continuity — do NOT drag the user back to a previous topic or link when they ask about a NEW one. " +
    "If they paste a new link/email or change subject, that new thing IS the topic now; answer it directly " +
    "and don't tell them to 'stay focused' on the old one. " +
    "SCOPE RULE: only answer questions related to security, scams, phishing, fraud, online safety, or the " +
    "specific link/email being discussed. If the user asks something OFF-TOPIC (weather, jokes, coding help, " +
    "general trivia, personal chat), politely decline in one sentence and steer back to security — " +
    "\"I'm just your security helper, so I stick to scams and online safety — want me to explain anything about this?\" " +
    "(That 'steer back' is ONLY for off-topic questions, never for a new security/link question.) " +
    "Keep answers concise, plain-English, and reassuring. Never give a definitive 'safe' for something the scan flagged. " +
    "FORMATTING: this shows in a small chat bubble, so keep it SHORT (2-4 sentences or a few bullet points). " +
    "Do NOT use big markdown headings (#, ##). You may use **bold** for a key term and simple '- ' bullets. " +
    "No section headers, no long documents — talk like a helpful person in a chat.";

  const ctxText = context
    ? `Context — the check the user is asking about:\n${JSON.stringify(context, null, 2)}\n\n`
    : "There is no specific link context; answer generally about scams/security.\n\n";

  // Fold recent conversation into the prompt (kept short).
  const convo = history.slice(-6).map((m) => `${m.role === "orbo" ? "Orbo" : "User"}: ${m.text}`).join("\n");

  const user = `${ctxText}${convo ? "Conversation so far:\n" + convo + "\n\n" : ""}User's question: ${question}`;

  try {
    const answer = await chatText({ system, user, maxTokens: 500, temperature: 0.3 });
    return res.json({ answer: answer.trim() });
  } catch (e) {
    console.warn("⚠ ask-orbo failed:", e.message);
    return res.status(502).json({ error: "Orbo couldn't answer just now." });
  }
});

// POST /api/ask-orbo/sender-report — a formal structured verdict about an email SENDER.
// Body: { email, context? }  →  a verdict-shaped object the client renders as a VerdictCard.
askOrboRouter.post("/sender-report", requireAuth, async (req, res) => {
  const { email, context } = req.body ?? {};
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "A valid sender email is required" });
  }
  if (!env.anthropicApiKey) return res.status(503).json({ error: "Sender report not configured" });
  try {
    const report = await generateSenderReport({ email: email.trim(), context: typeof context === "string" ? context : "" });
    return res.json(report);
  } catch (e) {
    console.warn("⚠ sender-report failed:", e.message);
    return res.status(502).json({ error: "Orbo couldn't build a sender report just now." });
  }
});
