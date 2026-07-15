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

// Most-impersonated brands → their LEGITIMATE registered domains. A lookalike is judged "safe"
// only if it lands on one of these exact domains for the matched brand (not just "some redirect").
const BRANDS = [
  { brand: "amazon", domains: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.co.jp", "amzn.to", "amazonaws.com", "a.co"] },
  { brand: "paypal", domains: ["paypal.com", "paypal.me"] },
  { brand: "google", domains: ["google.com", "google.co.uk", "goo.gl", "youtube.com", "youtu.be", "gmail.com"] },
  { brand: "microsoft", domains: ["microsoft.com", "live.com", "office.com", "outlook.com", "microsoftonline.com"] },
  { brand: "apple", domains: ["apple.com", "icloud.com", "me.com"] },
  { brand: "netflix", domains: ["netflix.com"] },
  { brand: "facebook", domains: ["facebook.com", "fb.com", "fb.me"] },
  { brand: "instagram", domains: ["instagram.com"] },
  { brand: "linkedin", domains: ["linkedin.com", "lnkd.in"] },
  { brand: "chase", domains: ["chase.com"] },
  { brand: "wellsfargo", domains: ["wellsfargo.com"] },
  { brand: "bankofamerica", domains: ["bankofamerica.com", "bofa.com"] },
  { brand: "dhl", domains: ["dhl.com"] },
  { brand: "fedex", domains: ["fedex.com"] },
  { brand: "usps", domains: ["usps.com"] },
];

// Every legit domain across all brands — a host that IS one of these is the real thing, never a lookalike.
const LEGIT_DOMAINS = new Set(BRANDS.flatMap((b) => b.domains));

// Multi-part public suffixes we care about, so "amazon.co.uk" → registered "amazon.co.uk"
// (not "co.uk") and "amazon.com.evil.ru" → registered "evil.ru" (not "amazon.com").
const MULTIPART_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "co.jp", "com.au", "co.nz", "com.br",
  "co.in", "com.mx", "co.za", "com.sg", "com.tr", "com.cn",
]);

// Homoglyph / leetspeak folding: collapse common look-alike substitutions to a canonical form
// so "arnazon" (rn→m), "paypa1" (1→l), "g00gle" (0→o) compare equal to the real brand name.
const CYRILLIC = { а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ѕ: "s" };
function fold(s) {
  return s
    .toLowerCase()
    .replace(/[аеорсхуіѕ]/g, (c) => CYRILLIC[c] ?? c) // Cyrillic look-alikes → Latin
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/5/g, "s");
}

// The registered ("eTLD+1") domain of a host: amazon.com, evil.ru, amazon.co.uk.
export function registeredDomain(host) {
  if (!host) return null;
  const labels = String(host).toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return labels.join(".") || null;
  const lastTwo = labels.slice(-2).join(".");
  if (labels.length >= 3 && MULTIPART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

// Standard Levenshtein edit distance (small strings, so the simple DP is fine).
function editDistance(a, b) {
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
function labelLooksLikeBrand(label, brand) {
  const f = fold(label);
  const b = fold(brand);
  if (f === b) return true; // exact after folding (arnazon → amazon)
  // near-miss typo: 1 edit for short brands, 2 for longer ones (amzon, amazn, amazom → amazon)
  const threshold = brand.length <= 5 ? 1 : 2;
  if (Math.abs(f.length - b.length) <= threshold && editDistance(f, b) <= threshold) return true;
  // brand embedded as a delimited token: "secure-paypal", "paypal-verify", "login.apple-id"
  if (new RegExp(`(^|[-_.])${b}([-_.]|$)`).test(f)) return true;
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
export function detectLookalike(submittedHost) {
  const reg = registeredDomain(submittedHost);
  if (!reg) return null;
  if (LEGIT_DOMAINS.has(reg)) return null; // it IS the real thing — not a lookalike

  const host = String(submittedHost).toLowerCase().replace(/^www\./, "");
  const regLabel = reg.split(".")[0];
  // Subdomain labels are everything to the LEFT of the registered domain (e.g. for
  // "amazon.com.evil.ru" reg is "evil.ru", so the subdomain labels are ["amazon", "com"]).
  const subLabels = host.endsWith(reg) ? host.slice(0, -reg.length).replace(/\.$/, "").split(".").filter(Boolean) : [];

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
export function assessTyposquat({ submittedHost, finalHost }) {
  const match = detectLookalike(submittedHost);
  if (!match) return { isLookalike: false, landsOnBrand: false, impersonation: false, evidence: [] };

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
