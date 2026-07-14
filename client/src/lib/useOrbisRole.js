// ============================================================
// Derive the Orbis role on the client from Clerk hooks.
// Mirrors server/src/middleware/roles.js deriveRole():
//   - no active org        → "individual"
//   - Clerk org:admin       → "analyst" (+ isAdmin=true)
//   - otherwise in an org   → "member"
// An explicit role in Clerk publicMetadata.orbisRole wins if present.
// ============================================================
import { useAuth, useOrganization, useUser } from "@clerk/clerk-react";

const VALID = ["individual", "member", "analyst"];

export function useOrbisRole() {
  const { orgId, orgRole } = useAuth();
  const { organization } = useOrganization();
  const { user } = useUser();

  const explicit = user?.publicMetadata?.orbisRole;
  let role;
  if (VALID.includes(explicit)) {
    role = explicit;
  } else if (!orgId) {
    role = "individual";
  } else if (orgRole === "org:admin" || orgRole === "admin") {
    role = "analyst";
  } else {
    role = "member";
  }

  return {
    role,
    isAdmin: orgRole === "org:admin" || orgRole === "admin",
    orgId: orgId ?? null,
    orgName: organization?.name ?? null,
  };
}
