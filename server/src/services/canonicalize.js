// ============================================================
// canonicalize(url) → canonical_key   (Orbis dedup — §5 "Option D")
// Collapses "same attack, different victim" URLs into one key so the
// same threat is scanned once and "seen before" works.
// This is PURE logic — no network, no keys — and is unit-testable now.
// Owner: David.
// ============================================================

// Query params that are tracking/marketing junk, not part of page identity.
const TRACKING_PARAMS = new Set([
  "ref", "fbclid", "gclid", "id", "email", "token", "recipient",
  "_hsenc", "_hsmi", "mc_eid", "mc_cid", "igshid", "vero_id", "yclid",
]);
const TRACKING_PREFIXES = ["utm_"]; // any param starting with these is dropped

const isTracking = (name) => {
  const n = name.toLowerCase();
  if (TRACKING_PARAMS.has(n)) return true;
  return TRACKING_PREFIXES.some((p) => n.startsWith(p));
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const BARE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only real web URLs may be submitted. Blocks file:, ftp:, data:, javascript:, etc.
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

// Is this hostname an internal / loopback / link-local / private (RFC1918) address? We reject
// these before they reach urlscan. NOTE: our server never fetches the submitted URL, so this
// is NOT a live SSRF fix — it's input hygiene + the first line of defense if a server-side
// fetch is ever added. (True SSRF protection would also need DNS-resolution checks.)
const isInternalHost = (host) => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  // IPv4 literal? check loopback / link-local / private ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127) return true;                 // 127.0.0.0/8 loopback
    if (a === 10) return true;                  // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;    // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true;    // 169.254.0.0/16 link-local (cloud metadata!)
  }
  return false;
}

/**
 * Normalize raw user input into a parseable URL string.
 * People paste bare domains ("amzon.com"), which the URL parser rejects because it needs a
 * scheme — so we prepend "https://". But a scheme-less email ("foo@bar.com") would then parse
 * as a URL (host bar.com, user "foo"), which is wrong: emails belong to the sender-report path,
 * not the scanner. So we reject bare emails here and let the caller route them elsewhere.
 * We also reject non-web schemes (file:/data:/etc.) and internal/private hosts (localhost,
 * 127.*, RFC1918, 169.254.* cloud-metadata) — throwing BLOCKED_URL so the caller can explain why.
 * @param {string} raw - input exactly as submitted
 * @returns {string} a URL string with a scheme; throws INVALID_URL / BLOCKED_URL otherwise
 */
export const normalizeUrl = (raw) => {
  const trimmed = String(raw).trim();
  // Dangerous no-slash schemes (data:, javascript:, vbscript:, file: without //) — block
  // explicitly so they don't slip past the "://" scheme check and get an https:// prepended.
  if (/^(data|javascript|vbscript|file):/i.test(trimmed)) throw new Error("BLOCKED_URL");
  const hasScheme = HAS_SCHEME.test(trimmed);
  if (!hasScheme && BARE_EMAIL.test(trimmed)) throw new Error("INVALID_URL");
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  let u;
  try {
    u = new URL(candidate);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (!ALLOWED_SCHEMES.has(u.protocol)) throw new Error("BLOCKED_URL"); // file:/data:/ftp:/etc.
  if (isInternalHost(u.hostname)) throw new Error("BLOCKED_URL");       // localhost / private / metadata
  return candidate;
}

/**
 * @param {string} rawUrl - the URL exactly as submitted
 * @returns {string} canonical_key, or throws if the URL is unparseable
 */
export const canonicalize = (rawUrl) => {
  const u = new URL(normalizeUrl(rawUrl));

  // 1. host: lowercase, drop leading "www." (http/https treated the same → we ignore scheme)
  let host = u.hostname.toLowerCase().replace(/^www\./, "");

  // 5. path: strip a single trailing slash (but keep "/")
  let path = u.pathname;
  if (path.length > 1) path = path.replace(/\/+$/, "");

  // 3 + 4. keep meaningful query params, drop tracking, sort for stability
  const kept = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!isTracking(k)) kept.push([k.toLowerCase(), v]);
  }
  kept.sort(([a], [b]) => a.localeCompare(b));
  const query = kept.length ? "?" + kept.map(([k, v]) => `${k}=${v}`).join("&") : "";

  // 2. fragment (#...) is already excluded by not reading u.hash
  return `${host}${path}${query}`;
}
