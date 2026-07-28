// ── feature: org · invitations (server-side Clerk ops) · owner: Michael ──
// Org invitations are created HERE, on the server, with the Clerk secret key — not from the
// browser. That keeps the privileged Clerk org API off the client and lets us control the invite
// email's redirect so it lands on the ORBIS sign-in page (with the invite ticket) instead of
// Clerk's hosted page. The invitee then accepts the ticket in our own SignIn.jsx.
//
// The caller must be an analyst (org admin); the route enforces that. We resolve the caller's
// Clerk org id from our Organization mirror row (req.user.orgId is our Prisma id).
import { clerkClient as defaultClerkClient } from "@clerk/express";
import { prisma as defaultPrisma } from "../../db.js";
import { env } from "../../config/env.js";

// Where the invite email should send people: our org sign-in page. SignIn.jsx reads the
// __clerk_ticket Clerk appends and accepts it (existing user → straight in; new user → set a
// password). type=organizational just flavors the page copy/footer.
const inviteRedirectUrl = () => `${env.clientUrl}/signin?type=organizational`;

// Basic email shape check so we don't ship obvious junk to Clerk (it validates too, but this
// gives a clean per-address error and avoids a round-trip on typos).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite one or more emails to the caller's organization.
 * @param {object} args
 * @param {number} args.orgId        caller's Prisma Organization id (req.user.orgId)
 * @param {string} args.inviterId    caller's Clerk user id (for Clerk's inviterUserId field)
 * @param {string[]} args.emails     addresses to invite
 * @param {object} [deps]            { prisma, clerkClient } for tests
 * @returns {Promise<{ invited: string[], failed: {email,reason}[] }>}
 */
export const inviteToOrg = async ({ orgId, inviterId, emails }, deps = {}) => {
  const prisma = deps.prisma || defaultPrisma;
  const clerk = deps.clerkClient || defaultClerkClient;

  if (!orgId) throw new Error("inviteToOrg: orgId is required");

  // Resolve our Prisma org → the Clerk organization id the invitation API needs.
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { clerkOrgId: true } });
  if (!org?.clerkOrgId) throw new Error("inviteToOrg: organization has no Clerk id");

  // De-dupe + normalize + validate up front so one bad address doesn't sink the batch.
  const seen = new Set();
  const clean = [];
  const failed = [];
  for (const raw of Array.isArray(emails) ? emails : []) {
    const email = String(raw).trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (!EMAIL_RE.test(email)) { failed.push({ email, reason: "invalid email" }); continue; }
    clean.push(email);
  }

  const invited = [];
  for (const email of clean) {
    try {
      await clerk.organizations.createOrganizationInvitation({
        organizationId: org.clerkOrgId,
        inviterUserId: inviterId ?? undefined,
        emailAddress: email,
        role: "org:member",
        redirectUrl: inviteRedirectUrl(), // ← invite email lands on Orbis, not Clerk's page
      });
      invited.push(email);
    } catch (err) {
      // A per-address failure (already a member, already invited, etc.) shouldn't abort the rest.
      const reason = err?.errors?.[0]?.message || err?.message || "invite failed";
      failed.push({ email, reason });
    }
  }

  return { invited, failed };
};
