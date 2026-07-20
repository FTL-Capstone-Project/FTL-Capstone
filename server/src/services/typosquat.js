// ============================================================
// Typosquat / lookalike detector (AI Feature A support).
//
// The question this answers: is the SUBMITTED domain a misspelling/lookalike of a well-known
// brand (amzon.com ≈ amazon.com, paypa1.com ≈ paypal.com)? And if so, does the link ACTUALLY
// land on that brand's real domain?
//   - lookalike that redirects to the real brand → the brand defensively owns the typo → SAFE
//   - lookalike that does NOT reach the real brand → impersonation → DANGEROUS
//
// The redirect fact comes from urlscan (services/urlscan.js, persisted on the Indicator). This
// module only decides "does the submitted host look like brand X, and does the final host BELONG
// to brand X". It is pure logic (no network) so it's unit-testable.
// Owner: David.
// ============================================================
import { domainToUnicode } from "node:url";

// Most-impersonated brands → their LEGITIMATE registered domains. A lookalike is judged "safe"
// only if it lands on one of these exact domains for the matched brand (not just "some redirect").
// This is our curated "who gets impersonated" list. It is deliberately a few DOZEN dominant
// phishing targets, NOT a top-million dump: fuzzy edit-distance matching against a huge list
// produces a false-positive explosion (in a million domains, tons of legit sites are 1 edit
// apart). The list-free signals below (punycode + mixed-script) catch look-alikes of ANY domain
// with no list at all, so the list only needs to cover plausible NO-trick typosquats.
const BRANDS = [
  // Retail / marketplaces
  { brand: "amazon", domains: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.co.jp", "amzn.to", "amazonaws.com", "a.co"] },
  { brand: "ebay", domains: ["ebay.com"] },
  { brand: "walmart", domains: ["walmart.com"] },
  // Payments / finance
  { brand: "paypal", domains: ["paypal.com", "paypal.me"] },
  { brand: "chase", domains: ["chase.com"] },
  { brand: "wellsfargo", domains: ["wellsfargo.com"] },
  { brand: "bankofamerica", domains: ["bankofamerica.com", "bofa.com"] },
  { brand: "citibank", domains: ["citi.com", "citibank.com"] },
  { brand: "capitalone", domains: ["capitalone.com"] },
  { brand: "usbank", domains: ["usbank.com"] },
  { brand: "americanexpress", domains: ["americanexpress.com", "aexp.com"] },
  { brand: "hsbc", domains: ["hsbc.com", "hsbc.co.uk"] },
  { brand: "barclays", domains: ["barclays.co.uk", "barclays.com"] },
  { brand: "santander", domains: ["santander.com", "santander.co.uk"] },
  { brand: "mastercard", domains: ["mastercard.com"] },
  { brand: "visa", domains: ["visa.com"] },
  // Crypto
  { brand: "coinbase", domains: ["coinbase.com"] },
  { brand: "binance", domains: ["binance.com"] },
  // Big tech / platforms
  { brand: "google", domains: ["google.com", "google.co.uk", "goo.gl", "youtube.com", "youtu.be", "gmail.com"] },
  { brand: "microsoft", domains: ["microsoft.com", "live.com", "office.com", "outlook.com", "microsoftonline.com"] },
  { brand: "apple", domains: ["apple.com", "icloud.com", "me.com"] },
  { brand: "netflix", domains: ["netflix.com"] },
  { brand: "facebook", domains: ["facebook.com", "fb.com", "fb.me"] },
  { brand: "instagram", domains: ["instagram.com"] },
  { brand: "whatsapp", domains: ["whatsapp.com"] },
  { brand: "linkedin", domains: ["linkedin.com", "lnkd.in"] },
  { brand: "adobe", domains: ["adobe.com"] },
  { brand: "dropbox", domains: ["dropbox.com"] },
  { brand: "docusign", domains: ["docusign.com", "docusign.net"] },
  { brand: "steam", domains: ["steampowered.com", "steamcommunity.com"] },
  // Telco
  { brand: "verizon", domains: ["verizon.com"] },
  { brand: "tmobile", domains: ["t-mobile.com"] },
  // Shipping / logistics
  { brand: "dhl", domains: ["dhl.com"] },
  { brand: "fedex", domains: ["fedex.com"] },
  { brand: "usps", domains: ["usps.com"] },
  { brand: "ups", domains: ["ups.com"] },
  // Government (tax-refund scams)
  { brand: "irs", domains: ["irs.gov"] },
];

// Every legit domain across all brands — a host that IS one of these is the real thing, never a lookalike.
const LEGIT_DOMAINS = new Set(BRANDS.flatMap((b) => b.domains));

// FREE / CONSUMER webmail providers. These ARE real domains (a link to gmail.com is genuinely
// Google), so they stay in the brand list for URL lookalike purposes. But as a SENDER domain they
// mean the opposite of trust: a message claiming to be official business/legal/corporate from a
// free webmail account is a classic red flag (real orgs send from their own domain). The sender
// report uses isFreeWebmail() to avoid falsely flooring these to "trusted brand domain".
const FREE_WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com",
  "zoho.com", "yandex.com", "yandex.ru", "hey.com", "fastmail.com", "tutanota.com",
]);

// Is the sender's registered domain a free/consumer webmail provider? (Checked against the
// registered domain so "foo.gmail.com" style tricks still resolve to gmail.com.)
export const isFreeWebmail = (host) => {
  const reg = registeredDomain(host);
  return reg != null && FREE_WEBMAIL.has(reg);
};

// Is this host (or its registered domain) an EXACT known-brand domain? Used by the sender
// report to tell "this IS linkedin.com" (trusted) from "this merely resembles it".
// Returns the brand name, or null. Defined after registeredDomain below is hoisted via
// function-expression order — so we compute the registered domain inline here.
export const knownBrandDomain = (host) => {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  const labels = h.split(".").filter(Boolean);
  // check the full host and its registered domain against the legit set
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (LEGIT_DOMAINS.has(candidate)) {
      const b = BRANDS.find((x) => x.domains.includes(candidate));
      return b ? b.brand : null;
    }
  }
  return null;
};

// Multi-part public suffixes we care about, so "amazon.co.uk" → registered "amazon.co.uk"
// (not "co.uk") and "amazon.com.evil.ru" → registered "evil.ru" (not "amazon.com").
const MULTIPART_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "co.jp", "com.au", "co.nz", "com.br",
  "co.in", "com.mx", "co.za", "com.sg", "com.tr", "com.cn",
]);

// Punycode → Unicode. Browsers show IDNs (internationalized domains) as "xn--…" on the wire,
// but the ACTUAL character a victim sees is the decoded Unicode. "xn--pple-43d.com" is really
// "аpple.com" with a Cyrillic а. new URL().hostname hands us the "xn--" form, so we MUST decode
// before folding/comparing — otherwise the homoglyph is invisible and every IDN lookalike slips
// through. domainToUnicode decodes per-label and leaves plain-ASCII hosts untouched.
const toUnicodeHost = (host) => {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!h.includes("xn--")) return h; // fast path: no IDN labels, nothing to decode
  try { return domainToUnicode(h) || h; } catch { return h; }
}

// Unicode ranges for the scripts used in homoglyph attacks. Latin is the "real" script of the
// brands we protect; Cyrillic and Greek are the usual disguises (а/е/о/р/с look identical to
// a/e/o/p/c). We detect the MIX, not the mere presence of non-ASCII — legit IDNs exist.
const LATIN_LETTER = /[a-z]/;
const CYRILLIC_LETTER = /[Ѐ-ӿ]/;
const GREEK_LETTER = /[Ͱ-Ͽ]/;

// Homoglyph / leetspeak folding: collapse common look-alike substitutions to a canonical form
// so "arnazon" (rn→m), "paypa1" (1→l), "g00gle" (0→o) compare equal to the real brand name.
// The Cyrillic map is expanded because after punycode decoding we see the full range, not just
// the few chars a hand-typed lookalike used.
const CYRILLIC = {
  а: "a", ә: "a", е: "e", ё: "e", о: "o", р: "p", с: "c", х: "x", у: "y",
  і: "i", ј: "j", ѕ: "s", к: "k", м: "m", н: "h", т: "t", в: "b", г: "r", ԁ: "d",
};
const GREEK = { ο: "o", α: "a", ε: "e", ρ: "p", τ: "t", ν: "v", κ: "k", ι: "i", υ: "u", χ: "x" };
const fold = (s) => {
  return s
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, (c) => CYRILLIC[c] ?? c) // Cyrillic look-alikes → Latin
    .replace(/[Ͱ-Ͽ]/g, (c) => GREEK[c] ?? c)    // Greek look-alikes → Latin
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/5/g, "s");
}

// Unicode BIDI CONTROL characters: LRE/RLE/PDF/LRO/RLO (U+202A–202E) and the isolates
// (U+2066–2069). These flip text direction and have NO legitimate use in a hostname, an email
// address, or a filename — their only purpose in phishing is the "right-to-left override" (RLO)
// trick that makes "photo_exe.scr" render on screen as "photo_rcs.exe". Any presence is a flag.
const BIDI_CONTROL = /[‪-‮⁦-⁩]/;

// Does this text contain a bidi-control character (RLO/LRO/etc.)? Standalone so the sender/vision
// paths can screen an address or a filename, not just a host.
export const containsBidiControl = (text) => BIDI_CONTROL.test(String(text || ""));

// LIST-FREE homoglyph signal: does any label MIX Latin with Cyrillic/Greek letters (the
// classic "аpple" trick), spell a Latin-looking word ENTIRELY in Cyrillic/Greek confusables
// ("раураl"), or hide a bidi-override (RLO) character? All mean the human-readable name is
// forged from look-alike/invisible characters — an attack that needs NO brand list, because no
// legitimate domain disguises Latin letters this way. Returns the offending label + how, or null.
export const detectConfusableScript = (host) => {
  // Bidi-control characters are illegitimate anywhere in a host — check the raw input first
  // (before decoding/normalizing, which could strip or reorder them).
  if (containsBidiControl(host)) {
    const firstLabel = String(host).split(".")[0] || String(host);
    return { label: firstLabel, script: "bidi-override", mixed: true, bidi: true };
  }
  const unicodeHost = toUnicodeHost(host);
  const labels = unicodeHost.split(".").filter(Boolean);
  // Skip the TLD label: a Cyrillic TLD like ".рф" is legitimate, the spoofing happens in the
  // NAME labels to its left. (Multi-part suffix labels like "co" are pure ASCII, so they're
  // simply skipped by the pure-Latin check below — no need to special-case them here.)
  const nameLabels = labels.length > 1 ? labels.slice(0, -1) : labels;
  for (const label of nameLabels) {
    const hasLatin = LATIN_LETTER.test(label);
    const hasCyrillic = CYRILLIC_LETTER.test(label);
    const hasGreek = GREEK_LETTER.test(label);
    if (!hasCyrillic && !hasGreek) continue; // pure-Latin/ASCII label — nothing foreign here
    const script = hasCyrillic ? "Cyrillic" : "Greek";
    // (a) mixed Latin + foreign in one word → always a disguise.
    if (hasLatin) return { label, script, mixed: true };
    // (b) all-foreign word that folds to plain ASCII letters → a Latin word written in a foreign
    // script (whole-script confusable). If it does NOT fold to ASCII it's a genuine foreign word.
    if (/^[a-z0-9-]+$/.test(fold(label))) return { label, script, mixed: false };
  }
  return null;
}

// The registered ("eTLD+1") domain of a host: amazon.com, evil.ru, amazon.co.uk.
export const registeredDomain = (host) => {
  if (!host) return null;
  const labels = String(host).toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return labels.join(".") || null;
  const lastTwo = labels.slice(-2).join(".");
  if (labels.length >= 3 && MULTIPART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

// Standard Levenshtein edit distance (small strings, so the simple DP is fine).
const editDistance = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Does `label` (the first part of a registered domain) look like `brand`?
const labelLooksLikeBrand = (label, brand) => {
  const f = fold(label);
  const b = fold(brand);
  if (f === b) return true; // exact after folding (arnazon → amazon)
  // near-miss typo threshold. VERY short brands (visa, ups, irs) get NO fuzzy budget: one edit
  // is a huge fraction of a 3-4 letter word, so "vista"≈"visa" / "ips"≈"ups" would be constant
  // false positives. Brands up to 7 chars allow 1 edit (amzon, amazn → amazon; dropbex → dropbox);
  // only long brands (>=8) get 2, where two edits is still a small fraction of the word. Giving
  // 6-char brands a budget of 2 was too loose — it wrongly matched real domains like "goggles"
  // (→google) and "plusbank" (→usbank). Rare double-typos fall through to the urlscan/LLM layers.
  const threshold = brand.length <= 4 ? 0 : brand.length <= 7 ? 1 : 2;
  if (threshold > 0 && Math.abs(f.length - b.length) <= threshold && editDistance(f, b) <= threshold) return true;

  // COMBOSQUAT: the brand appears as one word inside a multi-word label. Split on the usual
  // delimiters and inspect each token. Catches "secure-paypal", "netflix-billing-update", plus
  // the two trickier shapes below that plain exact-token matching used to miss.
  for (const tok of f.split(/[-_.]+/).filter(Boolean)) {
    if (tok === b) return true;                                       // exact token: "secure-paypal"
    // (a) MISSPELLED brand token: "amazoon-rewards" (amazoon ≈ amazon). Tight guard on purpose —
    // only ONE edit, and only for brands long enough (>=6) that a single typo can't collide with
    // an everyday word (this keeps "this-is-amazing"/"use-case" from matching amazon/chase).
    if (brand.length >= 6 && Math.abs(tok.length - b.length) <= 1 && editDistance(tok, b) === 1) return true;
    // (b) GLUED brand: fused to a descriptor with no delimiter ("paypalsupport", "microsoftonline",
    // "microsoftsupport"). Brand-FIRST (prefix) for >=6-char brands; brand-LAST (suffix) only for
    // >=9-char brands, since a short suffix like "...usbank" would false-match innocent "plusbank".
    if (tok.length > b.length) {
      if (brand.length >= 6 && tok.startsWith(b)) return true;
      if (brand.length >= 9 && tok.endsWith(b)) return true;
    }
  }
  return false;
}

/**
 * If `submittedHost` is a lookalike of a known brand (but not a legit domain), return the match.
 * Two patterns are caught:
 *   1. TYPOSQUAT — the registered domain's label is a misspelling ("amzon.com", "arnazon.com").
 *   2. BRAND-IN-SUBDOMAIN — a brand name hides in a subdomain while the real registered domain is
 *      something else ("amazon.com.evil.ru" → registered evil.ru). A classic phishing disguise.
 * @returns {{brand:string, domains:string[]}|null}
 */
export const detectLookalike = (submittedHost) => {
  const reg = registeredDomain(submittedHost);
  if (!reg) return null;
  if (LEGIT_DOMAINS.has(reg)) return null; // it IS the real thing — not a lookalike

  // Compare on the DECODED host so an IDN lookalike ("xn--pple-43d.com" → "аpple.com") is
  // matched against brands by the character a victim actually sees, not its punycode.
  const host = toUnicodeHost(submittedHost);
  const unicodeReg = toUnicodeHost(reg);
  const regLabel = unicodeReg.split(".")[0];
  // Subdomain labels are everything to the LEFT of the registered domain (e.g. for
  // "amazon.com.evil.ru" reg is "evil.ru", so the subdomain labels are ["amazon", "com"]).
  const subLabels = host.endsWith(unicodeReg) ? host.slice(0, -unicodeReg.length).replace(/\.$/, "").split(".").filter(Boolean) : [];

  for (const b of BRANDS) {
    if (labelLooksLikeBrand(regLabel, b.brand)) return { brand: b.brand, domains: b.domains };
    if (subLabels.some((l) => labelLooksLikeBrand(l, b.brand))) return { brand: b.brand, domains: b.domains };
  }
  return null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Combine lookalike detection with where the link actually landed.
 * @param {{submittedHost:string, finalHost:string|null}}
 * @returns {{ isLookalike, landsOnBrand, impersonation, brand?, evidence:[{text,severity}] }}
 */
export const assessTyposquat = ({ submittedHost, finalHost }) => {
  const match = detectLookalike(submittedHost);

  if (!match) {
    // No known-brand lookalike — but the LIST-FREE check still catches a domain whose
    // human-readable name is forged from confusable Cyrillic/Greek characters (no brand
    // needed). This is a hard impersonation signal regardless of destination: legitimate
    // sites don't spell their name in look-alike foreign letters.
    const confusable = detectConfusableScript(submittedHost);
    if (confusable) {
      const how = confusable.bidi
        ? "contains a hidden right-to-left override character that secretly reorders the text you see"
        : confusable.mixed
        ? `mixes Latin with ${confusable.script} look-alike characters`
        : `spells a Latin-looking name entirely in ${confusable.script} look-alike characters`;
      return {
        isLookalike: true, landsOnBrand: false, impersonation: true,
        evidence: [{
          text: `Deceptive web address: "${confusable.label}" ${how} to imitate a real name — a classic phishing disguise`,
          severity: "dangerous",
        }],
      };
    }
    return { isLookalike: false, landsOnBrand: false, impersonation: false, evidence: [] };
  }

  const realDomain = match.domains[0];
  const finalReg = finalHost ? registeredDomain(finalHost) : null;
  const landsOnBrand = finalReg != null && match.domains.includes(finalReg);

  if (landsOnBrand) {
    // Brand defensively owns the typo (amzon.com → amazon.com). Reassuring, not a threat.
    return {
      isLookalike: true, landsOnBrand: true, impersonation: false, brand: match.brand,
      evidence: [{
        text: `Looks like a misspelling of ${cap(match.brand)}, but it lands on the real ${realDomain} — ${cap(match.brand)} owns this typo domain`,
        severity: "safe",
      }],
    };
  }

  // Lookalike that does NOT reach the real brand. If we know the final host, that's confirmed
  // impersonation (a hard danger signal). If the destination is unknown, flag for review only.
  if (finalReg != null) {
    return {
      isLookalike: true, landsOnBrand: false, impersonation: true, brand: match.brand,
      evidence: [{
        text: `Impersonates ${cap(match.brand)} — this is a lookalike of ${realDomain} that does NOT lead to the real site`,
        severity: "dangerous",
      }],
    };
  }
  return {
    isLookalike: true, landsOnBrand: false, impersonation: false, brand: match.brand,
    evidence: [{
      text: `Domain resembles ${cap(match.brand)} (${realDomain}); could not confirm where it leads`,
      severity: "review",
    }],
  };
}
