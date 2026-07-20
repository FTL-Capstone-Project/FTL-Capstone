// ── url-shape signals · owner: David ──
// Deterministic red flags in the SHAPE of the submitted URL itself — no network, no LLM, so
// these fire identically whichever model we deploy behind (Claude, DeepSeek, a free model).
// Two tricks the scanner-evasion playbooks call out:
//   - RAW IP as host (http://45.33.32.9/login) — dodges domain-reputation scanners; real
//     businesses use named domains, so a bare IP behind a "login"/"verify" link is a red flag.
//   - UNUSUAL PORT (legit-looking-site.com:8443) — ordinary web traffic is 80/443; odd ports
//     are used to slip past security filters or host throwaway panels.
// These are SOFT signals (a nudge toward "review"), never a hard "dangerous" — some CDNs and
// dev tools legitimately use IPs or ports, so we don't cry wolf. Private/loopback/link-local
// IPs are already blocked BEFORE scanning (canonicalize.isInternalHost), so any IP that reaches
// here is public.
import { normalizeUrl } from "./canonicalize.js";

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// Is this host an IP literal (v4 or v6) rather than a domain name? Hostnames never contain a
// colon; an IPv6 literal always does (after stripping the [...] brackets the URL parser adds).
const isIpLiteral = (host) => {
  const h = String(host || "").replace(/^\[|\]$/g, "");
  return IPV4.test(h) || h.includes(":");
};

/**
 * Inspect the submitted URL's shape for deterministic red flags. Pure (no network) → unit-testable.
 * @param {string} rawUrl - the URL exactly as submitted
 * @returns {{ rawIpHost:boolean, unusualPort:number|null, evidence:{text,severity}[] }}
 */
export const assessUrlShape = (rawUrl) => {
  const evidence = [];
  let rawIpHost = false;
  let unusualPort = null;

  let u;
  try { u = new URL(normalizeUrl(rawUrl)); }
  catch { return { rawIpHost, unusualPort, evidence }; } // unparseable/blocked → no shape signal

  if (isIpLiteral(u.hostname)) {
    rawIpHost = true;
    evidence.push({
      text: `The link points to a raw IP address (${u.hostname}) instead of a domain name — legitimate companies use named domains, and a bare IP is a common way to dodge reputation checks`,
      severity: "review",
    });
  }

  // u.port is "" when the URL uses the scheme's default port; we treat 80 and 443 as normal for
  // either scheme. Anything else was set explicitly and is unusual for a real website.
  if (u.port && u.port !== "80" && u.port !== "443") {
    unusualPort = Number(u.port);
    evidence.push({
      text: `The link uses an unusual network port (:${u.port}) — normal websites use the default ports, and odd ports are often used to slip past security filters`,
      severity: "review",
    });
  }

  return { rawIpHost, unusualPort, evidence };
};
