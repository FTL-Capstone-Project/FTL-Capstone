import { describe, it, expect } from "vitest";
import { deriveRole, isAdminRole, normalizeRole, isAnalyst, ROLES } from "./roles.js";

describe("deriveRole", () => {
  it("no org → individual", () => {
    expect(deriveRole({ orgId: null })).toBe("individual");
    expect(deriveRole({})).toBe("individual");
  });

  it("org member (non-admin) → member", () => {
    expect(deriveRole({ orgId: "org_1", orgRole: "org:member" })).toBe("member");
  });

  it("org admin → analyst (admins get analyst surfaces)", () => {
    expect(deriveRole({ orgId: "org_1", orgRole: "org:admin" })).toBe("analyst");
    expect(deriveRole({ orgId: "org_1", orgRole: "admin" })).toBe("analyst");
  });

  it("explicit orbisRole in user metadata wins", () => {
    expect(
      deriveRole({ orgId: "org_1", orgRole: "org:member", userMetadata: { orbisRole: "analyst" } })
    ).toBe("analyst");
  });

  it("ignores an invalid explicit role and falls back to org logic", () => {
    expect(
      deriveRole({ orgId: "org_1", orgRole: "org:member", userMetadata: { orbisRole: "superuser" } })
    ).toBe("member");
  });
});

describe("isAdminRole", () => {
  it("true only for org:admin / admin", () => {
    expect(isAdminRole("org:admin")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("org:member")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});

describe("normalizeRole", () => {
  it("accepts valid roles case-insensitively", () => {
    expect(normalizeRole("Analyst")).toBe("analyst");
    expect(normalizeRole(" member ")).toBe("member");
    expect(normalizeRole("individual")).toBe("individual");
  });
  it("rejects unknown", () => {
    expect(normalizeRole("admin")).toBe(null);
    expect(normalizeRole(undefined)).toBe(null);
  });
});

describe("isAnalyst", () => {
  it("only analyst passes", () => {
    expect(isAnalyst(ROLES.ANALYST)).toBe(true);
    expect(isAnalyst(ROLES.MEMBER)).toBe(false);
    expect(isAnalyst(ROLES.INDIVIDUAL)).toBe(false);
  });
});
