// ============================================================
// Auth middleware — verifies the Clerk session and attaches
// req.user = { id, clerkUserId, role, orgId, email, name, isAdmin }
// for every protected route.
//
// Usage (unchanged for the team): `router.get("/x", requireAuth, handler)`.
//
// Real mode (Clerk keys present): reads the verified auth from clerkMiddleware()
//   (mounted app-wide in index.js), then lazily resolves the mirror User row.
// Dev-stub mode (no Clerk keys): injects a fake individual user so the rest of
//   the team can build behind this contract locally without live Clerk.
//
// Role is derived from Clerk org membership (see middleware/roles.js); "admin"
// is the Clerk org:admin permission surfaced as req.user.isAdmin (not a role).
//
// makeRequireAuth({ prisma, clerkClient, getAuth, clerkEnabled }) is exported for
// tests so the middleware can run with mocks and no live Clerk/DB.
// ============================================================
import { getAuth as clerkGetAuth, clerkClient as defaultClerkClient } from "@clerk/express";
import { prisma as defaultPrisma } from "../db.js";
import { env } from "../config/env.js";
import { resolveUser } from "../features/users/users.service.js";
import { isAdminRole } from "./roles.js";

const DEV_STUB_USER = Object.freeze({
  id: 1,
  clerkUserId: "user_devstub",
  role: "individual",
  orgId: null,
  email: "dev@orbis.local",
  name: "Dev User",
  isAdmin: false,
});

export function makeRequireAuth(deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const clerk = deps.clerkClient || defaultClerkClient;
  const getAuth = deps.getAuth || clerkGetAuth;
  // clerkEnabled can be forced in tests; defaults to the env-derived flag.
  const clerkEnabled = deps.clerkEnabled ?? env.clerkEnabled;

  return async function requireAuthMiddleware(req, res, next) {
    try {
      // ---- Dev stub: no Clerk configured → fake identity. ----
      if (!clerkEnabled) {
        // Resolve (create-or-fetch) the dev user's REAL mirror row so req.user.id is a
        // valid DB id — otherwise writes (submissions) and reads (history) disagree on
        // which user this is. Best-effort: if the DB is unavailable (e.g. unit tests),
        // fall back to the static stub so local building still works.
        try {
          const row = await resolveUser(db, {
            clerkUserId: DEV_STUB_USER.clerkUserId,
            email: DEV_STUB_USER.email,
            name: DEV_STUB_USER.name,
          });
          req.user = req.user ?? { ...DEV_STUB_USER, id: row.id, role: row.role, orgId: row.orgId };
        } catch {
          req.user = req.user ?? { ...DEV_STUB_USER };
        }
        return next();
      }

      // ---- Real Clerk verification ----
      const auth = getAuth(req);
      if (!auth?.userId) {
        return res.status(401).json({ error: "Unauthenticated" });
      }

      // Fetch email/name from Clerk (cheap, SDK-cached). Ids come from the token.
      let email = null;
      let name = null;
      try {
        const cu = await clerk.users.getUser(auth.userId);
        email =
          cu?.primaryEmailAddress?.emailAddress ??
          cu?.emailAddresses?.[0]?.emailAddress ??
          null;
        name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
      } catch {
        // Profile fetch failed — proceed with ids; resolveUser supplies a fallback email.
      }

      const mirror = await resolveUser(db, {
        clerkUserId: auth.userId,
        email,
        name,
        clerkOrgId: auth.orgId ?? null,
        orgRole: auth.orgRole ?? null,
        userMetadata: { sub: auth.userId },
      });

      req.user = {
        id: mirror.id,
        clerkUserId: mirror.clerkUserId,
        role: mirror.role,
        orgId: mirror.orgId,
        email: mirror.email,
        name: mirror.name,
        isAdmin: isAdminRole(auth.orgRole),
      };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// Default middleware used across the app (real prisma + real Clerk).
export const requireAuth = makeRequireAuth();
