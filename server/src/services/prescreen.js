// ── feature: prescreen · owner: David ──
// FAST, deterministic-only verdict for the browser extension's inline badge. The full check
// (POST /api/submissions) runs urlscan + LLM and takes 20-40s — far too slow to show "before you
// interact" on every email/link. This endpoint runs ONLY the sub-second deterministic layer we
// already built (typosquat / homoglyph / punycode / RLO / URL-shape / sender DNS) — no network
// sandbox, no model — and returns a 3-level badge: safe | warning | dangerous.
//
// It is honest about being a QUICK pre-check: it can be CERTAIN about things it sees (a Cyrillic
// homoglyph, a PayPal lookalike sender) and says so instantly, but it never claims the depth of
// the full scan. "See why" in the extension deep-links to the web app for the real report.
//
// Because it's deterministic, the verdict is identical behind any deployed model. Owner: David.
import { assessTyposquat, detectConfusableScript, detectLookalike, isFreeWebmail, knownBrandDomain, registeredDomain } from "./typosquat.js";
import { assessUrlShape } from "./urlShape.js";
import { checkSenderDns } from "./senderDns.js";

// Map the highest severity we saw to a badge level. "dangerous" beats "warning" beats "safe".
const rank = { safe: 0, warning: 1, dangerous: 2 };
const worse = (a, b) => (rank[b] > rank[a] ? b : a);

// A rough 0-100 safety score so the badge can show a number consistent with the main verdict
// (100 = clean, drops with each signal). This is a PRE-check number, not the rubric score.
const scoreFor = (level, hits) => {
  if (level === "dangerous") return 15;
  if (level === "warning") return Math.max(40, 65 - hits * 5);
  return 90; // clean deterministic pre-check — never a confident 100 (we haven't scanned)
};

// Assess ONE url with the deterministic detectors (no scan → no finalHost). Returns
// {level, reasons[]}. A brand lookalike with unknown destination is a WARNING (we can't confirm
// it reaches the real brand); a homoglyph/RLO/mixed-script host is DANGEROUS (needs no
// destination to be a forgery); raw-IP / odd-port are WARNING-level shape flags.
const assessOneUrl = (url) => {
  const reasons = [];
  let level = "safe";
  let host;
  try { host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname; }
  catch { return { level: "safe", reasons: [] }; } // unparseable → no signal (don't guess)

  // Homoglyph / mixed-script / RLO host → DANGEROUS regardless of destination. Unlike an ordinary
  // typo (which a brand might defensively own and redirect to itself — only the full scan can
  // confirm), no legitimate site ever registers its name in confusable Cyrillic/Greek or with a
  // bidi-override. So we don't wait for a destination we don't have in a pre-check: it's a forgery.
  const confusable = detectConfusableScript(host);
  if (confusable) {
    level = worse(level, "dangerous");
    const how = confusable.bidi ? "hides a right-to-left override character"
      : `uses ${confusable.script} characters disguised as normal letters`;
    reasons.push({ text: `Deceptive web address: "${confusable.label}" ${how} to imitate a real name — a classic phishing disguise.`, severity: "dangerous" });
  }

  // Brand lookalike WITHOUT a confusable trick (plain typo/combosquat like "paypa1", "amzon"). We
  // can't confirm the destination in a pre-check, so it's a WARNING, not a hard dangerous.
  const typo = assessTyposquat({ submittedHost: host, finalHost: null });
  if (!confusable && typo.isLookalike) {
    level = worse(level, "warning");
    const brand = typo.brand ? ` of ${typo.brand}` : "";
    reasons.push({ text: `This link's address looks like a lookalike${brand} — Orbis couldn't confirm it reaches the real site. Run a full check before trusting it.`, severity: "review" });
  }

  const shape = assessUrlShape(url);
  if (shape.evidence.length) {
    level = worse(level, "warning");
    reasons.push(...shape.evidence);
  }

  return { level, reasons };
};

// Deterministically pre-check a SENDER address (mirrors senderReport's assessSenderDomain, but
// no LLM). lookalike → dangerous; free webmail → warning-with-caveat; known brand → safe;
// unknown → lean on free DNS (non-resolving → warning). Async (DNS), still sub-second.
const assessSender = async (email) => {
  const at = String(email || "").lastIndexOf("@");
  if (at < 0) return { level: "safe", reasons: [] };
  const host = email.slice(at + 1);
  const domain = registeredDomain(host);

  if (isFreeWebmail(host)) {
    return { level: "warning", reasons: [{ text: `"${domain}" is a free/consumer webmail address, not a company domain — be wary if it claims to be official business or a known brand.`, severity: "review" }] };
  }
  const brand = knownBrandDomain(host);
  if (brand) {
    return { level: "safe", reasons: [{ text: `"${domain}" is a genuine ${brand} domain (a From address can still be spoofed — verify headers for anything important).`, severity: "safe" }] };
  }
  const look = detectLookalike(host);
  if (look) {
    return { level: "dangerous", reasons: [{ text: `The sender domain "${domain}" is a lookalike of ${look.brand}, not a real ${look.brand} address — this is impersonation.`, severity: "dangerous" }] };
  }
  // Unknown domain → free DNS signals only (never fabricates "dangerous").
  const dns = await checkSenderDns(domain);
  if (dns.checked && !dns.resolves) {
    return { level: "warning", reasons: [{ text: `The sender domain "${domain}" doesn't resolve on the internet — very unusual for a genuine sender.`, severity: "review" }] };
  }
  return { level: "safe", reasons: [] };
};

/**
 * Prescreen a sender and/or a list of URLs. Pure deterministic layer, sub-second.
 * @param {{ sender?:string, urls?:string[] }}
 * @returns {Promise<{ level:"safe"|"warning"|"dangerous", score:number, reasons:{text,severity}[] }>}
 */
export const prescreen = async ({ sender, urls = [] } = {}) => {
  let level = "safe";
  const reasons = [];

  if (sender) {
    const s = await assessSender(sender);
    level = worse(level, s.level);
    reasons.push(...s.reasons);
  }
  for (const url of Array.isArray(urls) ? urls.slice(0, 20) : []) {
    const u = assessOneUrl(url);
    level = worse(level, u.level);
    reasons.push(...u.reasons);
  }

  // Dedup identical reason text; keep the first 6.
  const seen = new Set();
  const deduped = reasons.filter((r) => (seen.has(r.text) ? false : seen.add(r.text)));

  return { level, score: scoreFor(level, deduped.length), reasons: deduped.slice(0, 6) };
};
