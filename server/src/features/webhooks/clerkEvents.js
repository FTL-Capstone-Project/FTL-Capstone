// ============================================================
// Pure Clerk-webhook event mapping — no svix, no DB, no Express.
// Turns a verified Clerk event into a normalized {action, payload}
// our sync code can act on. Easy to unit-test.
//
// Handled events (§6): user.*, organization.*, organizationMembership.*
// ============================================================

/**
 * Map a Clerk webhook event to a normalized instruction.
 * @param {{type: string, data: object}} event
 * @returns {{action: string, payload: object} | {action: "ignore", reason: string}}
 */
export const mapClerkEvent = (event) => {
  if (!event || typeof event.type !== "string") {
    return { action: "ignore", reason: "no event type" };
  }
  const { type, data = {} } = event;

  switch (type) {
    case "user.created":
    case "user.updated":
      return {
        action: "upsertUser",
        payload: {
          clerkUserId: data.id,
          email: primaryEmail(data),
          name: fullName(data),
        },
      };

    case "user.deleted":
      return { action: "deleteUser", payload: { clerkUserId: data.id } };

    case "organization.created":
    case "organization.updated":
      return {
        action: "upsertOrg",
        payload: { clerkOrgId: data.id, name: data.name || "Untitled org" },
      };

    case "organization.deleted":
      return { action: "deleteOrg", payload: { clerkOrgId: data.id } };

    case "organizationMembership.created":
    case "organizationMembership.updated":
      return {
        action: "syncMembership",
        payload: {
          clerkUserId: data.public_user_data?.user_id ?? data.user_id,
          clerkOrgId: data.organization?.id,
          orgName: data.organization?.name ?? null,
          orgRole: data.role ?? null, // e.g. "org:admin" | "org:member"
        },
      };

    case "organizationMembership.deleted":
      return {
        action: "removeMembership",
        payload: {
          clerkUserId: data.public_user_data?.user_id ?? data.user_id,
        },
      };

    default:
      return { action: "ignore", reason: `unhandled type: ${type}` };
  }
}

const primaryEmail = (data) => {
  if (!data) return null;
  const primaryId = data.primary_email_address_id;
  const list = data.email_addresses || [];
  const primary = list.find((e) => e.id === primaryId) || list[0];
  return primary?.email_address ?? null;
}

const fullName = (data) => {
  if (!data) return null;
  const n = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return n || data.username || null;
}
