// ============================================================
// AI Feature A — plain-English danger verdict. Takes distilled evidence
// (urlscan + Safe Browsing) → { ai_score 0-100, ai_verdict, ai_confidence, evidence_summary }.
//
// Claude (via the Salesforce LLM gateway — services/llm.js) reasons over the evidence and
// writes the score + human explanation. TWO guardrails make it safe:
//   1) DETERMINISTIC FLOOR — a hard signal (blacklist hit / cred-form on a <7-day domain)
//      forces score >= 80 regardless of what the model says. A known-bad URL can never be "safe".
//   2) FALLBACK — if the Claude call fails or returns junk, we use a rule-based verdict.
//      We never fabricate a "safe" from an error.
// Owner: David.
// ============================================================
import { chatJSON } from "./llm.js";

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export async function generateVerdict({ evidence = [], blacklist_hit, blacklist_source, domain_age_days, raw = {}, contextText }) {
  // ── Hard-signal floor (computed regardless of who writes the verdict) ──
  const credFormOnNewDomain =
    evidence.some((e) => /password|credential|login form/i.test(e.text)) &&
    domain_age_days != null && domain_age_days < 7;
  const hardSignal = blacklist_hit || credFormOnNewDomain;

  // ── Try Claude first; fall back to rules on any failure ──
  try {
    const ai = await claudeVerdict({ evidence, blacklist_hit, blacklist_source, domain_age_days, raw, contextText });
    let score = clamp(ai.score);
    if (hardSignal) score = Math.max(score, 80); // floor
    return {
      ai_score: score,
      ai_verdict: ai.verdict,
      ai_confidence: hardSignal ? "high" : (ai.confidence ?? "medium"),
      evidence_summary: evidence,
    };
  } catch (e) {
    console.warn("⚠ Claude verdict failed, using rule-based fallback:", e.message);
    return ruleBasedVerdict({ evidence, blacklist_hit, blacklist_source, domain_age_days, raw, hardSignal });
  }
}

// ── Claude call: reason over evidence, return {score, verdict, confidence} ──
async function claudeVerdict({ evidence, blacklist_hit, blacklist_source, domain_age_days, raw, contextText }) {
  const system =
    "You are Orbo, a friendly phishing-triage assistant that explains link safety to non-experts. " +
    "Given technical evidence about a URL, decide how dangerous it is. " +
    'Reply with ONLY minified JSON: {"score":<0-100 integer>,"verdict":"<one or two plain-English sentences a non-technical person understands, explaining WHY>","confidence":"low|medium|high"}. ' +
    "No markdown, no extra text. Higher score = more dangerous. Reference concrete evidence in the verdict. " +
    "If it is on a known-bad blacklist, it is confirmed malicious — score it near 100 and say so plainly.";

  const facts = {
    on_known_bad_blacklist: !!blacklist_hit,
    blacklist_source: blacklist_source ?? null,
    urlscan_flagged_malicious: !!raw.malicious,
    urlscan_score: raw.score ?? null,
    categories: raw.categories ?? [],
    impersonated_brands: raw.brands ?? [],
    final_url: raw.final_url ?? null,
    domain_age_days: domain_age_days ?? null,
    evidence: evidence.map((e) => e.text),
    user_context: contextText || null,
  };

  const user = `Here is the evidence gathered by the sandbox and blacklist check:\n${JSON.stringify(facts, null, 2)}\n\nGive your verdict as JSON.`;

  const out = await chatJSON({ system, user, maxTokens: 400, temperature: 0 });
  // validate the shape; throw (→ fallback) if it's not usable
  if (typeof out?.score !== "number" || typeof out?.verdict !== "string" || !out.verdict.trim()) {
    throw new Error("verdict JSON missing score/verdict");
  }
  return out;
}

// ── Rule-based fallback (also used before a key exists / on Claude errors) ──
function ruleBasedVerdict({ evidence, blacklist_hit, blacklist_source, domain_age_days, raw, hardSignal }) {
  let score = 10;
  if (raw.malicious) score += 55;
  if (typeof raw.score === "number") score += Math.max(0, raw.score) * 0.4;
  if (domain_age_days != null) {
    if (domain_age_days < 7) score += 35;
    else if (domain_age_days < 30) score += 20;
    else if (domain_age_days < 90) score += 8;
  }
  const dangers = evidence.filter((e) => e.severity === "dangerous").length;
  const reviews = evidence.filter((e) => e.severity === "review").length;
  score += dangers * 15 + reviews * 5;
  if ((raw.brands ?? []).length > 0) score += 20;
  if (hardSignal) score = Math.max(score, 80);
  score = clamp(score);

  const bucket = score >= 70 ? "dangerous" : score >= 35 ? "review" : "safe";
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

  return {
    ai_score: score,
    ai_verdict,
    ai_confidence: hardSignal ? "high" : evidence.length >= 3 ? "medium" : "low",
    evidence_summary: evidence,
  };
}

function prettySource(src) {
  if (!src) return "a security blacklist";
  const type = src.split(":")[1] ?? "";
  return `Google Safe Browsing${type ? " · " + type.toLowerCase().replace(/_/g, " ") : ""}`;
}
function topReasons(evidence) {
  const picks = [...evidence]
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .slice(0, 2)
    .map((e) => e.text.toLowerCase());
  return picks.length ? picks.join(" and ") : "I couldn't fully confirm it's safe";
}
const sevRank = (s) => (s === "dangerous" ? 2 : s === "review" ? 1 : 0);
