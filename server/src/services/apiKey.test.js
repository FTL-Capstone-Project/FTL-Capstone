import { describe, it, expect, vi } from "vitest";
import { generateApiKey, hashApiKey, looksLikeApiKey, issueApiKey, revokeApiKey, findUserByApiKey } from "./apiKey.js";

describe("apiKey — generation + hashing", () => {
  it("generates prefixed, high-entropy keys that are unique", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.startsWith("orbis_")).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(40); // orbis_ + 32 base64url bytes
  });

  it("looksLikeApiKey distinguishes keys from Clerk JWTs", () => {
    expect(looksLikeApiKey("orbis_abc")).toBe(true);
    expect(looksLikeApiKey("eyJhbGciOiJSUzI1NiJ9.payload.sig")).toBe(false); // a JWT
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey(null)).toBe(false);
  });

  it("hash is deterministic, hex, and never the raw key", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));       // same input → same hash
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);   // sha256 hex
    expect(hashApiKey(key)).not.toContain(key);          // hash never leaks the key
  });
});

describe("apiKey — persistence (mocked prisma)", () => {
  it("issue stores the HASH (never the raw key) and returns the raw key once", async () => {
    const update = vi.fn(async () => ({}));
    const prisma = { user: { update } };
    const raw = await issueApiKey(prisma, 7);
    expect(raw.startsWith("orbis_")).toBe(true);
    const stored = update.mock.calls[0][0].data.apiKeyHash;
    expect(stored).toBe(hashApiKey(raw)); // hash stored
    expect(stored).not.toBe(raw);         // NOT the raw key
    expect(update.mock.calls[0][0].where).toEqual({ id: 7 });
  });

  it("revoke nulls the hash (invalidates the key)", async () => {
    const update = vi.fn(async () => ({}));
    await revokeApiKey({ user: { update } }, 7);
    expect(update.mock.calls[0][0].data).toEqual({ apiKeyHash: null });
  });

  it("findUserByApiKey looks up by hash and returns the user", async () => {
    const raw = generateApiKey();
    const findUnique = vi.fn(async ({ where }) => (where.apiKeyHash === hashApiKey(raw) ? { id: 42 } : null));
    const user = await findUserByApiKey({ user: { findUnique } }, raw);
    expect(user).toEqual({ id: 42 });
    expect(findUnique.mock.calls[0][0].where).toEqual({ apiKeyHash: hashApiKey(raw) });
  });

  it("findUserByApiKey returns null for a non-key token without hitting the DB", async () => {
    const findUnique = vi.fn();
    const user = await findUserByApiKey({ user: { findUnique } }, "not-a-key");
    expect(user).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
