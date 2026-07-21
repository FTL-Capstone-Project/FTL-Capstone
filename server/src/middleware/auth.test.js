import { describe, it, expect, vi } from "vitest";
import { makeRequireAuth } from "./auth.js";
import { requireAnalyst } from "./requireAnalyst.js";
import { generateApiKey, hashApiKey } from "../services/apiKey.js";

const mockRes = () => {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe("requireAuth (dev-stub mode)", () => {
  it("injects a fake individual user when Clerk is disabled AND the stub is explicitly allowed", async () => {
    const mw = makeRequireAuth({ clerkEnabled: false, devStubAllowed: true });
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ role: "individual", orgId: null });
  });

  it("FAILS CLOSED (401, no fake user) when Clerk is disabled and the stub is NOT opted in", async () => {
    // Guards the fail-open case: a deploy missing Clerk keys must NOT serve a shared
    // fake identity just because the dev-stub exists.
    const mw = makeRequireAuth({ clerkEnabled: false, devStubAllowed: false });
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
  });
});

describe("requireAuth (real mode, mocked Clerk)", () => {
  const baseDeps = (auth) => ({
    clerkEnabled: true,
    getAuth: () => auth,
    clerkClient: { users: { getUser: vi.fn(async () => ({ primaryEmailAddress: { emailAddress: "p@acme.com" }, firstName: "Priya", lastName: "S" })) } },
    prisma: {
      organization: { upsert: vi.fn(async () => ({ id: 10 })) },
      user: { upsert: vi.fn(async ({ where, update, create }) => ({ id: 5, clerkUserId: where.clerkUserId, orgId: (update?.orgId ?? create?.orgId) ?? null, email: "p@acme.com", name: "Priya S", role: (update?.role ?? create?.role) })) },
    },
  });

  it("401 when no userId in the verified auth", async () => {
    const mw = makeRequireAuth(baseDeps({ userId: null }));
    const res = mockRes();
    const next = vi.fn();
    await mw({}, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("resolves an org admin to req.user.role=analyst + isAdmin=true", async () => {
    const mw = makeRequireAuth(baseDeps({ userId: "user_1", orgId: "org_1", orgRole: "org:admin" }));
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: 5, role: "analyst", orgId: 10, isAdmin: true });
  });

  it("resolves a plain org member to role=member + isAdmin=false", async () => {
    const mw = makeRequireAuth(baseDeps({ userId: "user_2", orgId: "org_1", orgRole: "org:member" }));
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(req.user.role).toBe("member");
    expect(req.user.isAdmin).toBe(false);
  });
});

describe("requireAuth (browser-extension API key)", () => {
  // A prisma mock whose user.findUnique matches ONLY the given key's hash.
  const prismaFor = (rawKey, row) => ({
    user: { findUnique: vi.fn(async ({ where }) => (where.apiKeyHash === hashApiKey(rawKey) ? row : null)) },
  });
  const reqWith = (key) => ({ headers: { authorization: `Bearer ${key}` } });

  it("resolves a valid key to its owning user (works even with Clerk enabled)", async () => {
    const key = generateApiKey();
    const row = { id: 9, clerkUserId: "user_x", role: "member", orgId: 3, email: "x@acme.com", name: "X" };
    const mw = makeRequireAuth({ clerkEnabled: true, prisma: prismaFor(key, row), getAuth: () => { throw new Error("Clerk path must NOT run for a key"); } });
    const req = reqWith(key);
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: 9, role: "member", orgId: 3, isAdmin: false });
  });

  it("never grants isAdmin via an API key, even for an org-admin user", async () => {
    const key = generateApiKey();
    const mw = makeRequireAuth({ clerkEnabled: true, prisma: prismaFor(key, { id: 1, role: "analyst", orgId: 2, clerkUserId: "u", email: "a@b.com", name: "A" }) });
    const req = reqWith(key);
    await mw(req, mockRes(), vi.fn());
    expect(req.user.isAdmin).toBe(false);
  });

  it("401 for a key-shaped token that resolves to no user (revoked/unknown)", async () => {
    const key = generateApiKey();
    const mw = makeRequireAuth({ clerkEnabled: true, prisma: { user: { findUnique: vi.fn(async () => null) } } });
    const res = mockRes();
    const next = vi.fn();
    await mw(reqWith(key), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("a non-key bearer token falls through to the Clerk path (not treated as a key)", async () => {
    const getAuth = vi.fn(() => ({ userId: null })); // Clerk path runs → 401 for no userId
    const mw = makeRequireAuth({ clerkEnabled: true, getAuth, prisma: { user: { findUnique: vi.fn() } } });
    const res = mockRes();
    await mw({ headers: { authorization: "Bearer eyJ.jwt.sig" } }, res, vi.fn());
    expect(getAuth).toHaveBeenCalledOnce(); // proves it took the Clerk branch
    expect(res.statusCode).toBe(401);
  });
});

describe("requireAnalyst", () => {
  const run = (user) => {
    const req = { user };
    const res = mockRes();
    const next = vi.fn();
    requireAnalyst(req, res, next);
    return { res, next };
  };

  it("401 when unauthenticated", () => {
    const { res, next } = run(undefined);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403 for a member", () => {
    const { res, next } = run({ role: "member" });
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes an analyst through", () => {
    const { res, next } = run({ role: "analyst" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });
});
