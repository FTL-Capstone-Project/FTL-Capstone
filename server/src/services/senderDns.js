// ── feature: sender report · owner: David ──
// FREE, native DNS signals for a sender's domain — no API key, no paid service, no dependency
// (Node's built-in node:dns/promises). The question this answers deterministically: does the
// sender's domain look like a REAL, mail-configured domain, or a throwaway?
//
// We check three free things every legitimate email domain has, plus whether it resolves at all:
//   - MX records   → the domain is set up to handle email
//   - SPF  (a TXT "v=spf1…")   → declares who may send mail as this domain
//   - DMARC (_dmarc TXT "v=DMARC1…") → policy tying SPF/DKIM together
//
// SECURITY EPISTEMICS (important): the ABSENCE of SPF/DMARC is a mild negative — established
// senders almost always publish them. But the PRESENCE of them means almost NOTHING for trust:
// a scammer can set up flawless SPF/DMARC on their own lookalike domain (paypa1-verify.net) in
// minutes. So this module WEIGHTS NEGATIVES and gives positives ~zero score effect (only an
// informational, caveated note). DNS alone can nudge an unknown sender toward "review"; it can
// never manufacture a "dangerous" verdict — that stays the job of the lookalike detector.
//
// Pure-ish + fully timeout-guarded so a slow/hanging resolver can't stall the sender report.
// Owner: David.
import dns from "node:dns/promises";

// A conservative hostname check so we never feed junk to the resolver.
const VALID_HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

// Run a DNS promise but never let it hang: resolve to a soft failure after timeoutMs. We treat a
// timeout the same as "couldn't determine" (never as a danger signal) so transient DNS trouble
// doesn't wrongly sink a legitimate sender.
const guarded = (promise, timeoutMs) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, code: "TIMEOUT" }), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([
    promise.then((value) => ({ ok: true, value }), (e) => ({ ok: false, code: e?.code || "ERR" })),
    timeout,
  ]).finally(() => clearTimeout(timer));
};

// Danger WEIGHTS for the DNS negatives (subtracted from 100 by the caller, capped). Small on
// purpose — these are soft signals, not proof. Kept in one visible table like verdict.js.
const DNS_WEIGHTS = {
  no_resolve: 30, // domain doesn't resolve at all — may not exist / dead / misconfigured
  no_mx: 8,       // resolves but has no mail records — unusual for a real sender
  no_spf: 8,      // no SPF record published
  no_dmarc: 6,    // no DMARC policy published
};
// A DNS check can shave at most this much off the score, so absent auth records alone can push
// "looks fine" → "worth a look" but never fabricate a hard "dangerous".
export const DNS_PENALTY_CAP = 30;

/**
 * Look up the free DNS signals for a sender domain.
 * @param {string} domain - the host part of the sender address (e.g. "company.com")
 * @returns {Promise<{checked:boolean, resolves:boolean, hasMx:boolean, hasSpf:boolean,
 *   hasDmarc:boolean, evidence:{text,severity}[], penalty:number}>}
 */
export const checkSenderDns = async (domain, { timeoutMs = 3000 } = {}) => {
  const host = String(domain || "").trim().toLowerCase().replace(/\.$/, "");
  const none = { checked: false, resolves: false, hasMx: false, hasSpf: false, hasDmarc: false, evidence: [], penalty: 0 };
  if (!host || !VALID_HOST.test(host)) return none;

  // Fire all lookups concurrently; each is independently timeout-guarded.
  const [mx, txt, dmarcTxt, addr] = await Promise.all([
    guarded(dns.resolveMx(host), timeoutMs),
    guarded(dns.resolveTxt(host), timeoutMs),
    guarded(dns.resolveTxt(`_dmarc.${host}`), timeoutMs),
    guarded(dns.resolve(host), timeoutMs), // A records — a second way to confirm the domain exists
  ]);

  // "Resolves" = the domain exists in DNS in ANY form (mail, txt, or address record).
  const resolves = (mx.ok && mx.value.length > 0) || (txt.ok && txt.value.length > 0) || (addr.ok && addr.value.length > 0);
  const hasMx = mx.ok && Array.isArray(mx.value) && mx.value.length > 0;
  const flatTxt = txt.ok ? txt.value.map((chunks) => chunks.join("")) : [];
  const hasSpf = flatTxt.some((r) => /^v=spf1\b/i.test(r));
  const hasDmarc = dmarcTxt.ok && dmarcTxt.value.map((c) => c.join("")).some((r) => /^v=DMARC1\b/i.test(r));

  const evidence = [];
  let penalty = 0;
  const add = (key, text, severity = "review") => { penalty += DNS_WEIGHTS[key] ?? 0; evidence.push({ text, severity }); };

  if (!resolves) {
    // If it doesn't resolve, don't ALSO pile on no-MX/no-SPF/no-DMARC (they're all trivially
    // absent) — that would double-count one underlying fact. Emit the single strong signal.
    add("no_resolve", `The domain "${host}" doesn't resolve on the internet — it may not exist or is misconfigured, which is very unusual for a genuine sender`);
  } else {
    if (!hasMx) add("no_mx", `"${host}" has no mail (MX) records — it isn't set up to receive email, unusual for a real organization`);
    if (!hasSpf) add("no_spf", `"${host}" publishes no SPF record — legitimate senders almost always do, and its absence makes spoofing easier`);
    if (!hasDmarc) add("no_dmarc", `"${host}" publishes no DMARC policy — most established organizations do`);
    // Fully authenticated: informational only. Presence is NOT proof of trust (scammers can set
    // these up on their own domain), so weight 0 and say so — never a false reassurance.
    if (hasMx && hasSpf && hasDmarc) {
      evidence.push({ text: `"${host}" has email authentication configured (MX, SPF, and DMARC) — a small positive, though scammers can set these up too`, severity: "safe" });
    }
  }

  return { checked: true, resolves, hasMx, hasSpf, hasDmarc, evidence, penalty: Math.min(penalty, DNS_PENALTY_CAP) };
};
