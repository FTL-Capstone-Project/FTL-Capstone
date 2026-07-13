// ============================================================
// AI Feature A — danger verdict. Takes distilled evidence (urlscan + Safe Browsing)
// → { ai_score 0-100, ai_verdict (plain English), ai_confidence, evidence_summary }.
//
// TWO PHASES of this file's life:
//   NOW  — real *rule-based* scoring over real evidence (no more fake keywords).
//   NEXT — Claude writes the plain-English `ai_verdict` from the same evidence
//          (structured outputs). The SCORING FLOOR + validation below stay either way,
//          so a known-bad URL can never be reported "safe" regardless of model output.
// Owner: David.
// ============================================================
import { env } from "../config/env.js";

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export async function generateVerdict({ evidence = [], blacklist_hit, blacklist_source, domain_age_days, raw = {}, contextText }) {
  // ── 1) Base score from concrete signals ──────────────────────────────────
  let score = 10; // start optimistic; every red flag pushes it up

  if (raw.malicious) score += 55;                       // urlscan itself called it malicious
  if (typeof raw.score === "number") score += Math.max(0, raw.score) * 0.4; // urlscan 0-100 malice score
  if (domain_age_days != null) {
    if (domain_age_days < 7) score += 35;               // brand-new domain = classic phishing
    else if (domain_age_days < 30) score += 20;
    else if (domain_age_days < 90) score += 8;
  }
  // count severities in the evidence list
  const dangers = evidence.filter((e) => e.severity === "dangerous").length;
  const reviews = evidence.filter((e) => e.severity === "review").length;
  score += dangers * 15 + reviews * 5;
  if ((raw.brands ?? []).length > 0) score += 20;       // impersonating a known brand

  // ── 2) Deterministic FLOOR on hard signals (spec §8) ─────────────────────
  // A confirmed known-bad URL can NEVER come back "safe", whatever the math says.
  const credFormOnNewDomain =
    evidence.some((e) => /password|credential|login form/i.test(e.text)) &&
    domain_age_days != null && domain_age_days < 7;
  const hardSignal = blacklist_hit || credFormOnNewDomain;
  if (hardSignal) score = Math.max(score, 80);

  score = clamp(score);

  // ── 3) Bucket + plain-English text (Claude will rewrite this text next step) ─
  const bucket = score >= 70 ? "dangerous" : score >= 35 ? "review" : "safe";
  const confidence = hardSignal ? "high" : evidence.length >= 3 ? "medium" : "low";

  let ai_verdict;
  if (blacklist_hit) {
    ai_verdict = `This link is on a known-bad list (${prettySource(blacklist_source)}) — it has already been confirmed as a scam. Do not click it.`;
  } else if (bucket === "dangerous") {
    ai_verdict = `This link looks dangerous — ${topReasons(evidence)}. I'd recommend not clicking it.`;
  } else if (bucket === "review") {
    ai_verdict = `This one's worth a closer look — ${topReasons(evidence)}. Be careful before entering any details.`;
  } else {
    ai_verdict = "Good news — this link looks safe. I found no strong signs of a scam.";
  }

  // NEXT STEP: if (env.anthropicApiKey) ai_verdict = await claudeVerdict({ evidence, raw, contextText, score, bucket });

  return { ai_score: score, ai_verdict, ai_confidence: confidence, evidence_summary: evidence };
}

function prettySource(src) {
  if (!src) return "a security blacklist";
  const type = src.split(":")[1] ?? "";
  return `Google Safe Browsing${type ? " · " + type.toLowerCase().replace(/_/g, " ") : ""}`;
}

// Fold the most severe evidence lines into a short human phrase.
function topReasons(evidence) {
  const picks = [...evidence]
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .slice(0, 2)
    .map((e) => e.text.toLowerCase());
  return picks.length ? picks.join(" and ") : "I couldn't fully confirm it's safe";
}
const sevRank = (s) => (s === "dangerous" ? 2 : s === "review" ? 1 : 0);
