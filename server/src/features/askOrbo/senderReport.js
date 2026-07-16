// ── sender report · owner: David ──
// A formal, structured verdict about an EMAIL SENDER (not a URL — senders can't be
// sandbox-detonated). Claude scores the sender's legitimacy from signals we can reason
// about: domain legitimacy, lookalike/typosquatting, display-name vs address mismatch,
// and any urgency/credential-request cues from the image context. Returns the SAME shape
// as the URL verdict so the client reuses VerdictCard.
import { chatJSON } from "../../services/llm.js";

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// { email, context? } → { ai_score, ai_verdict, ai_confidence, title, tags, evidence:[{text,severity}] }
export const generateSenderReport = async ({ email, context = "" }) => {
  const system =
    "You are Orbo, a phishing-triage assistant producing a SENDER REPORT on an email address. " +
    "Judge how trustworthy the SENDER is (you cannot sandbox an email, so reason from the address + any context). " +
    "Consider: is the domain a real, well-known company domain, or a lookalike/typosquat (paypa1.com, uber-support.net, " +
    "slack-notifications.com)? Free/consumer domain posing as a company? Display-name vs address mismatch? " +
    "Urgency, credential/payment requests, or other scam cues in the context? " +
    "Reply ONLY with minified JSON: " +
    '{"score":<0-100 SAFETY score, 100 = clearly trustworthy sender, 0 = definitely a scammer>,' +
    '"title":"<2-5 word headline, e.g. \\"Legit Uber sender\\" or \\"Spoofed PayPal sender\\">",' +
    '"verdict":"<1-2 plain-English sentences on whether to trust this sender and why>",' +
    '"tags":["<1-3 chips, e.g. \\"Verified domain\\", \\"Lookalike domain\\", \\"Impersonation\\">"],' +
    '"reasons":[{"text":"<short reason>","severity":"safe|review|dangerous"}],' +
    '"confidence":"low|medium|high"}. ' +
    "Give AT LEAST 3 reasons; if the sender looks suspicious give MORE (4-6) covering every red flag. " +
    "IMPORTANT: a real matching domain is a GOOD sign but NOT proof (display addresses can be spoofed) — " +
    "always note that the user should verify the full email headers. No markdown, no extra text.";

  const user = `Sender email: ${email}\nContext from the message (if any): ${context || "none provided"}\n\nGive the sender report as JSON.`;

  const out = await chatJSON({ system, user, maxTokens: 500, temperature: 0 });
  if (typeof out?.score !== "number" || typeof out?.verdict !== "string" || !out.verdict.trim()) {
    throw new Error("sender report JSON missing score/verdict");
  }
  const score = clamp(out.score);
  const sev = (s) => (["safe", "review", "dangerous"].includes(s) ? s : "review");
  const reasons = Array.isArray(out.reasons)
    ? out.reasons.filter((r) => r?.text?.trim()).map((r) => ({ text: r.text.trim(), severity: sev(r.severity) }))
    : [];

  return {
    status: "done",
    ai_score: score,
    ai_verdict: out.verdict.trim(),
    ai_confidence: out.confidence ?? "medium",
    title: (out.title || "").trim() || "Sender report",
    tags: Array.isArray(out.tags) ? out.tags.slice(0, 3) : [],
    evidence: reasons.length ? reasons : [{ text: "Assessed the sender address and available context", severity: "review" }],
    screenshot_url: null,
    report_count: 1,
    review: null,
    isSenderReport: true, // lets the client label the card "Sender report"
  };
}
