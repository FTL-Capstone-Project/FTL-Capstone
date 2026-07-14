import { describe, it, expect, vi } from "vitest";
import { resolveUser, applyClerkEvent, ensureOrganization } from "./users.service.js";

// Minimal in-memory-ish mock Prisma: records calls and returns plausible rows.
function mockPrisma() {
  return {
    organization: {
      upsert: vi.fn(async ({ create, where }) => ({ id: 10, clerkOrgId: where.clerkOrgId, name: create?.name ?? "Acme" })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    user: {
      upsert: vi.fn(async ({ where, create, update }) => ({
        id: 1,
        clerkUserId: where.clerkUserId,
        orgId: (update?.orgId ?? create?.orgId) ?? null,
        email: (update?.email ?? create?.email) ?? null,
        name: (update?.name ?? create?.name) ?? null,
        role: (update?.role ?? create?.role) ?? "individual",
      })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("resolveUser", () => {
  it("individual (no org) → role individual, orgId null", async () => {
    const p = mockPrisma();
    const u = await resolveUser(p, { clerkUserId: "user_1", email: "a@b.com", name: "A" });
    expect(u.role).toBe("individual");
    expect(u.orgId).toBe(null);
    expect(p.organization.upsert).not.toHaveBeenCalled();
    expect(p.user.upsert).toHaveBeenCalledOnce();
  });

  it("org admin → ensures org + role analyst", async () => {
    const p = mockPrisma();
    const u = await resolveUser(p, {
      clerkUserId: "user_2", email: "priya@acme.com", clerkOrgId: "org_1", orgName: "Acme", orgRole: "org:admin",
    });
    expect(p.organization.upsert).toHaveBeenCalledOnce();
    expect(u.orgId).toBe(10);
    expect(u.role).toBe("analyst");
  });

  it("org member → role member", async () => {
    const p = mockPrisma();
    const u = await resolveUser(p, { clerkUserId: "user_3", clerkOrgId: "org_1", orgRole: "org:member" });
    expect(u.role).toBe("member");
  });

  it("throws without clerkUserId", async () => {
    const p = mockPrisma();
    await expect(resolveUser(p, {})).rejects.toThrow(/clerkUserId/);
  });

  it("supplies a fallback email when none given", async () => {
    const p = mockPrisma();
    await resolveUser(p, { clerkUserId: "user_x" });
    const createArg = p.user.upsert.mock.calls[0][0].create;
    expect(createArg.email).toContain("user_x");
  });
});

describe("ensureOrganization", () => {
  it("returns null when no clerkOrgId", async () => {
    const p = mockPrisma();
    expect(await ensureOrganization(p, {})).toBe(null);
    expect(p.organization.upsert).not.toHaveBeenCalled();
  });
});

describe("applyClerkEvent", () => {
  it("upsertUser calls user.upsert", async () => {
    const p = mockPrisma();
    const r = await applyClerkEvent(p, { action: "upsertUser", payload: { clerkUserId: "u1", email: "e@x.com", name: "N" } });
    expect(p.user.upsert).toHaveBeenCalledOnce();
    expect(r).toMatch(/upserted/);
  });

  it("deleteUser calls user.deleteMany", async () => {
    const p = mockPrisma();
    await applyClerkEvent(p, { action: "deleteUser", payload: { clerkUserId: "u1" } });
    expect(p.user.deleteMany).toHaveBeenCalledWith({ where: { clerkUserId: "u1" } });
  });

  it("syncMembership resolves the user with org + role", async () => {
    const p = mockPrisma();
    await applyClerkEvent(p, {
      action: "syncMembership",
      payload: { clerkUserId: "u1", clerkOrgId: "org_1", orgName: "Acme", orgRole: "org:admin" },
    });
    expect(p.organization.upsert).toHaveBeenCalledOnce();
    expect(p.user.upsert).toHaveBeenCalledOnce();
  });

  it("removeMembership resets user to individual", async () => {
    const p = mockPrisma();
    await applyClerkEvent(p, { action: "removeMembership", payload: { clerkUserId: "u1" } });
    expect(p.user.updateMany).toHaveBeenCalledWith({
      where: { clerkUserId: "u1" },
      data: { orgId: null, role: "individual" },
    });
  });

  it("ignore action is a no-op", async () => {
    const p = mockPrisma();
    const r = await applyClerkEvent(p, { action: "ignore", reason: "x" });
    expect(r).toMatch(/ignored/);
    expect(p.user.upsert).not.toHaveBeenCalled();
  });
});
