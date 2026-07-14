import { describe, it, expect } from "vitest";
import { mapClerkEvent } from "./clerkEvents.js";

describe("mapClerkEvent", () => {
  it("user.created → upsertUser with primary email + full name", () => {
    const out = mapClerkEvent({
      type: "user.created",
      data: {
        id: "user_1",
        primary_email_address_id: "e2",
        email_addresses: [
          { id: "e1", email_address: "old@x.com" },
          { id: "e2", email_address: "primary@x.com" },
        ],
        first_name: "Priya",
        last_name: "S",
      },
    });
    expect(out).toEqual({
      action: "upsertUser",
      payload: { clerkUserId: "user_1", email: "primary@x.com", name: "Priya S" },
    });
  });

  it("user.deleted → deleteUser", () => {
    expect(mapClerkEvent({ type: "user.deleted", data: { id: "user_9" } })).toEqual({
      action: "deleteUser",
      payload: { clerkUserId: "user_9" },
    });
  });

  it("organization.created → upsertOrg", () => {
    expect(mapClerkEvent({ type: "organization.created", data: { id: "org_1", name: "Acme" } })).toEqual({
      action: "upsertOrg",
      payload: { clerkOrgId: "org_1", name: "Acme" },
    });
  });

  it("organizationMembership.created → syncMembership with role", () => {
    const out = mapClerkEvent({
      type: "organizationMembership.created",
      data: {
        role: "org:admin",
        organization: { id: "org_1", name: "Acme" },
        public_user_data: { user_id: "user_1" },
      },
    });
    expect(out).toEqual({
      action: "syncMembership",
      payload: { clerkUserId: "user_1", clerkOrgId: "org_1", orgName: "Acme", orgRole: "org:admin" },
    });
  });

  it("organizationMembership.deleted → removeMembership", () => {
    const out = mapClerkEvent({
      type: "organizationMembership.deleted",
      data: { public_user_data: { user_id: "user_1" } },
    });
    expect(out).toEqual({ action: "removeMembership", payload: { clerkUserId: "user_1" } });
  });

  it("unknown / malformed → ignore", () => {
    expect(mapClerkEvent({ type: "session.created", data: {} }).action).toBe("ignore");
    expect(mapClerkEvent({}).action).toBe("ignore");
    expect(mapClerkEvent(null).action).toBe("ignore");
  });
});
