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

/**
 * Normalize raw user input into a parseable URL string.
 * People paste bare domains ("amzon.com"), which the URL parser rejects because it needs a
 * scheme — so we prepend "https://". But a scheme-less email ("foo@bar.com") would then parse
 * as a URL (host bar.com, user "foo"), which is wrong: emails belong to the sender-report path,
 * not the scanner. So we reject bare emails here and let the caller route them elsewhere.
 * @param {string} raw - input exactly as submitted
 * @returns {string} a URL string with a scheme; throws INVALID_URL for emails / unparseable input
 */
export const normalizeUrl = (raw) => {
  const trimmed = String(raw).trim();
  const hasScheme = HAS_SCHEME.test(trimmed);
  if (!hasScheme && BARE_EMAIL.test(trimmed)) throw new Error("INVALID_URL");
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    new URL(candidate);
  } catch {
    throw new Error("INVALID_URL");
  }
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
