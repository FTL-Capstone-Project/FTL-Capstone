// ============================================================
// Mirror-row resolution + Clerk→DB sync helpers.
//
// Clerk owns identity; Postgres keeps MIRROR rows (users, organizations).
// The Clerk webhook (webhooks.routes.js) is the primary sync path, but a
// webhook can lag or be missed — so resolveUser() lazily creates-or-fetches
// the mirror row on the first authenticated request (§11 Q9 backstop).
//
// All functions take a Prisma client as the first arg so they can be unit-tested
// with a mock. No Express, no Clerk SDK here.
// ============================================================
import { deriveRole } from "../../middleware/roles.js";

/**
 * Ensure a mirror Organization row exists for a Clerk org. Returns the row (or null).
 */
export async function ensureOrganization(prisma, { clerkOrgId, name }) {
  if (!clerkOrgId) return null;
  return prisma.organization.upsert({
    where: { clerkOrgId },
    update: { ...(name ? { name } : {}) },
    create: { clerkOrgId, name: name || "Untitled org" },
  });
}

/**
 * Resolve the mirror User for a verified Clerk session, creating it if missing.
 * Keeps role + orgId in sync with the current Clerk context on every call.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} identity  { clerkUserId, email, name, clerkOrgId, orgName, orgRole, orgMetadata, userMetadata }
 * @returns {Promise<{id, clerkUserId, orgId, email, name, role}>}
 */
export async function resolveUser(prisma, identity) {
  const {
    clerkUserId,
    email,
    name = null,
    clerkOrgId = null,
    orgName = null,
    orgRole = null,
    orgMetadata = null,
    userMetadata = null,
  } = identity;

  if (!clerkUserId) throw new Error("resolveUser: clerkUserId is required");

  const org = clerkOrgId ? await ensureOrganization(prisma, { clerkOrgId, name: orgName }) : null;
  const role = deriveRole({ orgId: clerkOrgId, orgRole, orgMetadata, userMetadata });

  return prisma.user.upsert({
    where: { clerkUserId },
    update: { orgId: org?.id ?? null, role, ...(email ? { email } : {}), ...(name ? { name } : {}) },
    create: { clerkUserId, email: email ?? `${clerkUserId}@placeholder.orbis`, name, orgId: org?.id ?? null, role },
  });
}

/**
 * Delete a mirror user by Clerk id (used by the user.deleted webhook). Safe if absent.
 */
export async function deleteUserByClerkId(prisma, clerkUserId) {
  return prisma.user.deleteMany({ where: { clerkUserId } });
}

/**
 * Delete a mirror org by Clerk id (organization.deleted webhook). Safe if absent.
 */
export async function deleteOrgByClerkId(prisma, clerkOrgId) {
  return prisma.organization.deleteMany({ where: { clerkOrgId } });
}

/**
 * Upsert a mirror user from a webhook (no org context — that arrives via membership events).
 */
export async function upsertUserFromWebhook(prisma, { clerkUserId, email, name }) {
  if (!clerkUserId) throw new Error("upsertUserFromWebhook: clerkUserId required");
  return prisma.user.upsert({
    where: { clerkUserId },
    update: { ...(email ? { email } : {}), ...(name ? { name } : {}) },
    create: {
      clerkUserId,
      email: email ?? `${clerkUserId}@placeholder.orbis`,
      name: name ?? null,
      role: "individual",
    },
  });
}

/**
 * Apply a normalized Clerk event (from mapClerkEvent) to the mirror tables.
 * Returns a short result tag for logging/tests.
 */
export async function applyClerkEvent(prisma, mapped) {
  switch (mapped.action) {
    case "upsertUser":
      await upsertUserFromWebhook(prisma, mapped.payload);
      return "user upserted";

    case "deleteUser":
      await deleteUserByClerkId(prisma, mapped.payload.clerkUserId);
      return "user deleted";

    case "upsertOrg":
      await ensureOrganization(prisma, mapped.payload);
      return "org upserted";

    case "deleteOrg":
      await deleteOrgByClerkId(prisma, mapped.payload.clerkOrgId);
      return "org deleted";

    case "syncMembership": {
      // Membership create/update carries the org + Clerk role → set role + orgId.
      await resolveUser(prisma, {
        clerkUserId: mapped.payload.clerkUserId,
        clerkOrgId: mapped.payload.clerkOrgId,
        orgName: mapped.payload.orgName,
        orgRole: mapped.payload.orgRole,
        userMetadata: { sub: mapped.payload.clerkUserId },
      });
      return "membership synced";
    }

    case "removeMembership":
      // User left/was removed from the org → back to an individual account.
      await prisma.user.updateMany({
        where: { clerkUserId: mapped.payload.clerkUserId },
        data: { orgId: null, role: "individual" },
      });
      return "membership removed";

    case "ignore":
    default:
      return `ignored: ${mapped.reason || mapped.action}`;
  }
}
