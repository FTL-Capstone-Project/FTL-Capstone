// ============================================================
// AI Feature A — plain-English safety verdict. Takes distilled evidence
// (urlscan + Safe Browsing) → { ai_score 0-100, ai_verdict, ai_confidence, evidence_summary }.
//
// SCORE DIRECTION: ai_score is a 0-100 SAFETY score, 100 = SAFE (matches the DB / whole app).
// Higher = safer. A confirmed known-bad URL scores LOW.
//
// Claude (via the Salesforce LLM gateway — services/llm.js) reasons over the evidence and
// writes the score + human explanation. TWO guardrails make it safe:
//   1) DETERMINISTIC CEILING — a hard signal (blacklist hit / cred-form on a <7-day domain)
//      forces score <= 20 regardless of what the model says. A known-bad URL can never look "safe".
//   2) FALLBACK — if the Claude call fails or returns junk, we use a rule-based verdict.
//      We never fabricate a high (safe) score from an error.
// Owner: David.
// ============================================================
import { chatJSON } from "./llm.js";

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export async function generateVerdict({ evidence = [], blacklist_hit, blacklist_source, domain_age_days, raw = {}, contextText }) {
  // ── Hard-signal ceiling (computed regardless of who writes the verdict) ──
  const credFormOnNewDomain =
    evidence.some((e) => /password|credential|login form/i.test(e.text)) &&
    domain_age_days != null && domain_age_days < 7;
  const hardSignal = blacklist_hit || credFormOnNewDomain;

  // ── Try Claude first; fall back to rules on any failure ──
  try {
    const ai = await claudeVerdict({ evidence, blacklist_hit, blacklist_source, domain_age_days, raw, contextText });
    let score = clamp(ai.score);
    if (hardSignal) score = Math.min(score, 20); // ceiling: known-bad can't score "safe"
    return {
      ai_score: score,
      ai_verdict: ai.verdict,
      ai_confidence: hardSignal ? "high" : (ai.confidence ?? "medium"),
      // Fields Ozias's Reports card renders (title/description/tags). Fall back if the
      // model omitted them so the card is never blank.
      title: cleanTitle(ai.title) || fallbackTitle(raw, blacklist_source, score),
      description: cleanText(ai.description) || firstSentence(ai.verdict),
      tags: cleanTags(ai.tags, raw),
      // Always exactly 3 "why Orbo flagged this" reasons (Claude's, padded from evidence if needed).
      evidence_summary: buildReasons(ai.reasons, evidence, score),
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
    "Given technical evidence about a URL, decide how SAFE it is. " +
    "Reply with ONLY minified JSON with these fields: " +
    '{"score":<0-100 integer, a SAFETY score where 100 = completely safe and 0 = definitely malicious>,' +
    '"title":"<a short 2-5 word headline for this check, e.g. \\"Fake PayPal login\\" or \\"Legit LinkedIn page\\">",' +
    '"description":"<ONE short plain-English sentence summarizing the result>",' +
    '"verdict":"<one or two plain-English sentences explaining WHY, for a non-technical person>",' +
    '"tags":["<1-3 short category chips, e.g. \\"Credential phishing\\", \\"Impersonation\\", \\"Safe\\">"],' +
    '"reasons":[{"text":"<short reason Orbo reached this verdict>","severity":"safe|review|dangerous"}],' +
    '"confidence":"low|medium|high"}. ' +
    "REASONS RULE: give AT LEAST 3 reasons. If the link is SAFE, give 3 reassuring reasons. " +
    "If it is SUSPICIOUS or DANGEROUS, give MORE — list EVERY red flag you can justify from the evidence " +
    "(aim for 4-6) so the user sees the full case for not clicking. Each reason short and concrete. " +
    "No markdown, no extra text. REMEMBER: higher score = SAFER (100 = safe, 0 = malicious). " +
    "If it is on a known-bad blacklist, it is confirmed malicious — score it near 0 and say so plainly.";

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

  const out = await chatJSON({ system, user, maxTokens: 500, temperature: 0 });
  // validate the shape; throw (→ fallback) if it's not usable
  if (typeof out?.score !== "number" || typeof out?.verdict !== "string" || !out.verdict.trim()) {
    throw new Error("verdict JSON missing score/verdict");
  }
  return out;
}

// ── Rule-based fallback (also used before a key exists / on Claude errors) ──
// Compute a DANGER score internally, then convert to a SAFETY score (100 - danger).
function ruleBasedVerdict({ evidence, blacklist_hit, blacklist_source, domain_age_days, raw, hardSignal }) {
  let danger = 10;
  if (raw.malicious) danger += 55;
  if (typeof raw.score === "number") danger += Math.max(0, raw.score) * 0.4;
  if (domain_age_days != null) {
    if (domain_age_days < 7) danger += 35;
    else if (domain_age_days < 30) danger += 20;
    else if (domain_age_days < 90) danger += 8;
  }
  const dangers = evidence.filter((e) => e.severity === "dangerous").length;
  const reviews = evidence.filter((e) => e.severity === "review").length;
  danger += dangers * 15 + reviews * 5;
  if ((raw.brands ?? []).length > 0) danger += 20;

  let score = clamp(100 - danger); // → SAFETY score
  if (hardSignal) score = Math.min(score, 20); // ceiling: known-bad can't look safe

  const bucket = scoreBucket(score);
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
    title: fallbackTitle(raw, blacklist_source, score),
    description: firstSentence(ai_verdict),
    tags: cleanTags(null, raw, bucket, blacklist_source),
    evidence_summary: buildReasons(null, evidence, score),
  };
}

// SAFETY-score → bucket. 100 = safe, so HIGH score = safe. (Single source of truth.)
export function scoreBucket(score) {
  if (score == null) return "review";
  if (score >= 70) return "safe";
  if (score >= 35) return "review";
  return "dangerous";
}

// Return the "why" rows [{text, severity}] — AT LEAST 3 always. For a SAFE link, 3 reassuring
// reasons is enough. For a suspicious/dangerous link, keep MORE (up to 6) so the user sees the
// full case against clicking. Prefer the model's reasons, fall back to scan evidence, then pad.
function buildReasons(modelReasons, evidence, score) {
  const sev = (s) => (["safe", "review", "dangerous"].includes(s) ? s : "review");
  const isSafe = score >= 70;
  const cap = isSafe ? 3 : 6; // safe = concise; risky = show them all
  let rows = [];
  if (Array.isArray(modelReasons)) {
    rows = modelReasons
      .filter((r) => r && typeof r.text === "string" && r.text.trim())
      .map((r) => ({ text: r.text.trim(), severity: sev(r.severity) }));
  }
  // supplement from raw scan evidence (dedup by text)
  if (Array.isArray(evidence)) {
    for (const e of evidence) {
      if (rows.length >= cap) break;
      if (e?.text && !rows.some((r) => r.text === e.text)) rows.push({ text: e.text, severity: sev(e.severity) });
    }
  }
  // guarantee a floor of 3 with honest generic lines matching the verdict
  const pad = isSafe
    ? ["No known-bad blacklist matches", "Reaches an established, reachable site", "No obvious credential-stealing signs"]
    : ["Signals don't fully add up to a trusted site", "Treat unexpected requests with caution", "Double-check the real sender before acting"];
  for (const p of pad) {
    if (rows.length >= 3) break;
    if (!rows.some((r) => r.text === p)) rows.push({ text: p, severity: isSafe ? "safe" : "review" });
  }
  return rows.slice(0, cap);
}

// ── helpers for the Reports-card fields (title / description / tags) ──
function cleanTitle(t) {
  if (typeof t !== "string") return null;
  const s = t.trim().replace(/^["']|["']$/g, "");
  return s && s.length <= 60 ? s : (s ? s.slice(0, 57) + "…" : null);
}
function cleanText(t) {
  return typeof t === "string" && t.trim() ? t.trim() : null;
}
function firstSentence(text) {
  if (!text) return "";
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
// Build a sensible title when the model didn't give one. (score = SAFETY: low = dangerous)
function fallbackTitle(raw = {}, blacklist_source, score) {
  const brand = (raw.brands ?? [])[0];
  if (blacklist_source) return brand ? `Known ${brand} scam` : "Known bad link";
  if (score < 35) return brand ? `Fake ${brand} page` : "Dangerous link";
  if (score < 70) return brand ? `Suspicious ${brand} lookalike` : "Suspicious link";
  return "Looks safe";
}
// Normalize tags: use the model's if valid, else derive from evidence/brand/bucket.
function cleanTags(modelTags, raw = {}, bucket, blacklist_source) {
  if (Array.isArray(modelTags)) {
    const t = modelTags.map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
    if (t.length) return t;
  }
  const tags = [];
  if (blacklist_source) tags.push("Known threat");
  if ((raw.categories ?? []).length) tags.push(...raw.categories.slice(0, 2));
  if ((raw.brands ?? []).length) tags.push("Impersonation");
  if (!tags.length) tags.push(bucket === "safe" ? "Safe" : bucket === "dangerous" ? "Dangerous" : "Review");
  return [...new Set(tags)].slice(0, 3);
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
