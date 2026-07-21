// ── feature: api-key · owner: David ──
// Per-user API keys for the browser extension (and any future non-Clerk client). The extension
// has no Clerk browser session, so it can't mint a short-lived Clerk JWT — it needs a long-lived
// credential it sends as `Authorization: Bearer <key>`. We issue our OWN key instead of borrowing
// Clerk's, which buys per-user revocation, no surprise expiry, and a story we can defend.
//
// SECURITY MODEL (mirrors how passwords are handled):
//   - The raw key is shown to the user EXACTLY ONCE, at generation. We never store it.
//   - We store only its SHA-256 hash (User.apiKeyHash, unique). A leaked DB reveals no usable key.
//   - Auth looks a presented key up by its hash → resolves the owning user. O(1), no scan.
//   - Rotating overwrites the hash, which instantly invalidates the previous key (revocation).
//   - Prefix "orbis_" lets the auth middleware cheaply tell "this is an API key" from "this is a
//     Clerk JWT" before doing any work.
//
// SHA-256 (not bcrypt) is deliberate and safe HERE: the key is 256 bits of CRYPTO-RANDOM entropy,
// not a human password, so it isn't brute-forceable — a slow password hash would only add latency
// to every authenticated request for no security gain. (bcrypt exists to slow attacks on
// low-entropy secrets; that threat doesn't apply to a random 32-byte token.)
import crypto from "node:crypto";

const PREFIX = "orbis_";

// Cheap shape check the middleware uses to route a token to the API-key path vs the Clerk path.
export const looksLikeApiKey = (token) => typeof token === "string" && token.startsWith(PREFIX);

// SHA-256 hex of a raw key. Constant given the same input, so it doubles as the lookup index.
export const hashApiKey = (rawKey) => crypto.createHash("sha256").update(String(rawKey)).digest("hex");

// Generate a fresh key: "orbis_" + 32 random bytes (base64url). Returns the RAW key (show once).
export const generateApiKey = () => PREFIX + crypto.randomBytes(32).toString("base64url");

/**
 * Issue (or rotate) the calling user's API key. Overwrites any prior key → the old one stops
 * working immediately. Returns the RAW key; the caller must surface it once and never persist it.
 * @returns {Promise<string>} the raw key (orbis_...)
 */
export const issueApiKey = async (prisma, userId) => {
  const rawKey = generateApiKey();
  await prisma.user.update({ where: { id: userId }, data: { apiKeyHash: hashApiKey(rawKey) } });
  return rawKey;
};

/** Revoke the user's key (extension can no longer authenticate). Safe if none exists. */
export const revokeApiKey = async (prisma, userId) => {
  await prisma.user.update({ where: { id: userId }, data: { apiKeyHash: null } });
};

/**
 * Resolve the user who owns a presented raw key, by hash. Returns the User row or null.
 * Null = no such key (or revoked). Never throws on a bad key.
 */
export const findUserByApiKey = async (prisma, rawKey) => {
  if (!looksLikeApiKey(rawKey)) return null;
  return prisma.user.findUnique({ where: { apiKeyHash: hashApiKey(rawKey) } });
};
