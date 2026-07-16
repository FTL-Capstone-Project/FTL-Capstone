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

/**
 * @param {string} rawUrl - the URL exactly as submitted
 * @returns {string} canonical_key, or throws if the URL is unparseable
 */
export const canonicalize = (rawUrl) => {
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new Error("INVALID_URL");
  }

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
