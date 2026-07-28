import { describe, it, expect, vi, beforeEach } from "vitest";
import { inviteToOrg } from "./org.service.js";

// Mock prisma (resolve our Prisma org → Clerk org id) + clerkClient (the invitation call).
const orgFindUnique = vi.fn();
const createInvite = vi.fn();
const deps = () => ({
  prisma: { organization: { findUnique: (...a) => orgFindUnique(...a) } },
  clerkClient: { organizations: { createOrganizationInvitation: (...a) => createInvite(...a) } },
});

beforeEach(() => {
  orgFindUnique.mockReset().mockResolvedValue({ clerkOrgId: "org_clerk_123" });
  createInvite.mockReset().mockResolvedValue({ id: "inv_1" });
});

describe("inviteToOrg", () => {
  it("creates a Clerk invitation per email, scoped to the caller's Clerk org, pointed at Orbis", async () => {
    const res = await inviteToOrg({ orgId: 5, inviterId: "user_admin", emails: ["a@x.com", "b@y.com"] }, deps());
    expect(res.invited).toEqual(["a@x.com", "b@y.com"]);
    expect(res.failed).toEqual([]);
    // Resolved OUR prisma org id → the Clerk org id used for the invite.
    expect(orgFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
    // Each invite targets the resolved Clerk org, as org:member, redirecting back to Orbis signin.
    const call = createInvite.mock.calls[0][0];
    expect(call.organizationId).toBe("org_clerk_123");
    expect(call.role).toBe("org:member");
    expect(call.redirectUrl).toMatch(/\/signin\?type=organizational$/);
    expect(call.inviterUserId).toBe("user_admin");
  });

  it("normalizes + de-dupes emails (lowercased, no repeats)", async () => {
    const res = await inviteToOrg({ orgId: 5, emails: ["A@x.com", "a@x.com", " a@x.com "] }, deps());
    expect(res.invited).toEqual(["a@x.com"]);
    expect(createInvite).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed emails without calling Clerk for them", async () => {
    const res = await inviteToOrg({ orgId: 5, emails: ["good@x.com", "not-an-email"] }, deps());
    expect(res.invited).toEqual(["good@x.com"]);
    expect(res.failed).toEqual([{ email: "not-an-email", reason: "invalid email" }]);
    expect(createInvite).toHaveBeenCalledTimes(1); // only the valid one
  });

  it("isolates a per-address Clerk failure (already a member) without sinking the batch", async () => {
    createInvite
      .mockResolvedValueOnce({ id: "inv_ok" })
      .mockRejectedValueOnce({ errors: [{ message: "already a member" }] });
    const res = await inviteToOrg({ orgId: 5, emails: ["ok@x.com", "dupe@x.com"] }, deps());
    expect(res.invited).toEqual(["ok@x.com"]);
    expect(res.failed).toEqual([{ email: "dupe@x.com", reason: "already a member" }]);
  });

  it("throws if the org has no Clerk id (never calls Clerk with a bad target)", async () => {
    orgFindUnique.mockResolvedValue(null);
    await expect(inviteToOrg({ orgId: 999, emails: ["a@x.com"] }, deps())).rejects.toThrow(/Clerk id/);
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("throws without an orgId (no unscoped invite)", async () => {
    await expect(inviteToOrg({ orgId: null, emails: ["a@x.com"] }, deps())).rejects.toThrow(/orgId is required/);
  });
});
