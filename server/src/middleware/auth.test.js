import { describe, it, expect, vi } from "vitest";
import { makeRequireAuth } from "./auth.js";
import { requireAnalyst } from "./requireAnalyst.js";

const mockRes = () => {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe("requireAuth (dev-stub mode)", () => {
  it("injects a fake individual user when Clerk is disabled", async () => {
    const mw = makeRequireAuth({ clerkEnabled: false });
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ role: "individual", orgId: null });
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
