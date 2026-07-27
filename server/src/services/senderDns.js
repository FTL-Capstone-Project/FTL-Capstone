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

// Did a lookup actually ANSWER us? There's a world of difference between "the resolver told us this
// record does not exist" (evidence we can legitimately score) and "we never got a reply" (our own
// ignorance). Node reports the first as ENOTFOUND/ENODATA and the second as a timeout / SERVFAIL /
// refused / temporary failure. Only an ANSWER may cost the sender points — see the penalty block.
const DEFINITIVE_ABSENCE = new Set(["ENOTFOUND", "ENODATA", "NOTFOUND", "NXDOMAIN"]);
// The subset that means "this domain name does not exist at all" (not merely "no record of this type").
const NXDOMAIN_CODES = new Set(["ENOTFOUND", "NOTFOUND", "NXDOMAIN"]);
const isDetermined = (result) => result.ok || DEFINITIVE_ABSENCE.has(result.code);

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

  // Which lookups actually came back with an answer (records OR a definitive "not there")?
  const answered = { mx: isDetermined(mx), txt: isDetermined(txt), dmarc: isDetermined(dmarcTxt), addr: isDetermined(addr) };

  // "Resolves" = the domain exists in DNS in ANY form (mail, txt, or address record).
  const hasAnyRecords = (mx.ok && mx.value.length > 0) || (txt.ok && txt.value.length > 0) || (addr.ok && addr.value.length > 0);
  // Only claim a domain is MISSING from DNS when we actually established that: either the resolver
  // said the name doesn't exist, or every existence probe answered and none found anything.
  const knownAbsent = [mx, txt, dmarcTxt, addr].some((r) => !r.ok && NXDOMAIN_CODES.has(r.code))
    || (answered.mx && answered.txt && answered.addr);

  // Inconclusive across the board (resolver blip, offline dev box, sandbox with no DNS) → we learned
  // NOTHING. Report "not checked" so callers skip the DNS adjustment entirely instead of scoring our
  // ignorance. Without this, a transient blip cost every unknown-domain sender the full 30-point
  // no_resolve penalty AND told the user a perfectly real domain "may not exist" — a false-positive
  // storm triggered by nothing but slow DNS. (This is what the timeout note above always promised.)
  if (!hasAnyRecords && !knownAbsent) return none;

  const resolves = hasAnyRecords;
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
    if (answered.mx && !hasMx) add("no_mx", `"${host}" has no mail (MX) records — it isn't set up to receive email, unusual for a real organization`);
    // Missing SPF is only a red flag when DMARC is ALSO missing. Big senders (uber.com,
    // google.com) legitimately publish SPF on their sending SUBDOMAINS, not the apex, and rely on
    // DMARC for apex protection — so "no apex SPF but yes DMARC" is a normal, well-configured
    // pattern, not a warning. Penalizing it dinged legit brands (the uber.com false-alarm). We
    // only flag missing SPF when there's no DMARC either, i.e. genuinely no domain auth at all.
    if (answered.txt && !hasSpf && answered.dmarc && !hasDmarc) add("no_spf", `"${host}" publishes no SPF record — combined with no DMARC, this domain has no email authentication at all, which is unusual for a legitimate sender`);
    if (answered.dmarc && !hasDmarc) add("no_dmarc", `"${host}" publishes no DMARC policy — most established organizations do`);
    // Any email authentication present is informational only. Presence is NOT proof of trust
    // (scammers can set these up on their own domain), so weight 0 and say so — never a false
    // reassurance. Cover the big-sender case (MX + DMARC, apex SPF on subdomains) too.
    if (hasMx && (hasSpf || hasDmarc)) {
      const which = [hasMx && "MX", hasSpf && "SPF", hasDmarc && "DMARC"].filter(Boolean).join(", ");
      evidence.push({ text: `"${host}" has email authentication configured (${which}) — a small positive, though scammers can set these up too`, severity: "safe" });
    }
  }

  return { checked: true, resolves, hasMx, hasSpf, hasDmarc, evidence, penalty: Math.min(penalty, DNS_PENALTY_CAP) };
};
