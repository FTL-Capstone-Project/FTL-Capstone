// ============================================================
// Pure role logic — no Clerk, no DB, no Express. Easy to unit-test.
//
// Orbis roles: individual | member | analyst  (stored in users.role).
// "admin" is NOT a role value — it is the Clerk org:admin PERMISSION,
// layered on top (an admin is an analyst who can also manage the team).
// ============================================================

export const ROLES = Object.freeze({
  INDIVIDUAL: "individual",
  MEMBER: "member",
  ANALYST: "analyst",
});

/**
 * Derive an Orbis role from Clerk auth context.
 *
 * @param {object} ctx
 * @param {string|null} ctx.orgId        Clerk active org id (null = personal account)
 * @param {string|null} ctx.orgRole      Clerk org role, e.g. "org:admin" | "org:member"
 * @param {object|null} ctx.orgMetadata  org publicMetadata (may carry an explicit role)
 * @param {object|null} ctx.userMetadata user publicMetadata (may carry an explicit role)
 * @returns {"individual"|"member"|"analyst"}
 *
 * Rules:
 *  - No org  → individual.
 *  - In an org: an explicit role in metadata (set by the app/admin) wins.
 *  - Otherwise Clerk org:admin maps to analyst (admins get the analyst surfaces);
 *    everyone else in the org is a member.
 */
export const deriveRole = ({ orgId, orgRole, orgMetadata, userMetadata } = {}) => {
  if (!orgId) return ROLES.INDIVIDUAL;

  const explicit = normalizeRole(userMetadata?.orbisRole ?? orgMetadata?.[`role:${userMetadata?.sub}`]);
  if (explicit) return explicit;

  if (isAdminRole(orgRole)) return ROLES.ANALYST;
  return ROLES.MEMBER;
}

/** True when the Clerk org role grants team-management (admin) permission. */
export const isAdminRole = (orgRole) => {
  return orgRole === "org:admin" || orgRole === "admin";
}

/** Coerce an arbitrary string to a valid Orbis role, or null if unrecognized. */
export const normalizeRole = (value) => {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().trim();
  if (v === ROLES.INDIVIDUAL || v === ROLES.MEMBER || v === ROLES.ANALYST) return v;
  return null;
}

/** Roles allowed to reach analyst-only routes. */
export const isAnalyst = (role) => {
  return role === ROLES.ANALYST;
}
