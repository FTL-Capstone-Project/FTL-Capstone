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
import { findUserByApiKey, looksLikeApiKey } from "../services/apiKey.js";
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

export const makeRequireAuth = (deps = {}) => {
  const db = deps.prisma || defaultPrisma;
  const clerk = deps.clerkClient || defaultClerkClient;
  const getAuth = deps.getAuth || clerkGetAuth;
  // clerkEnabled can be forced in tests; defaults to the env-derived flag.
  const clerkEnabled = deps.clerkEnabled ?? env.clerkEnabled;

  // FAIL CLOSED by default: the dev stub logs everyone in as one fake user, so it must
  // be EXPLICITLY opted into (ORBIS_DEV_STUB=1) and never activate by accident. We do
  // NOT infer safety from NODE_ENV (nothing in the app sets it) — a deploy that simply
  // forgot the Clerk keys must refuse, not silently expose the whole API under one
  // shared identity. devStubAllowed can be forced in tests via deps.devStubAllowed.
  const devStubAllowed = deps.devStubAllowed ?? env.devStubAllowed;

  return async (req, res, next) => {
    try {
      // ---- Browser-extension API key (checked FIRST, works in any mode). ----
      // The extension can't produce a Clerk session token, so it presents a long-lived
      // "orbis_" key on Authorization. We resolve the owning user by the key's hash. This is a
      // full, real identity (not the dev stub) — so it's honored even when Clerk is enabled.
      // A malformed/revoked key falls through to the normal paths (→ 401), never 500s.
      const bearer = (req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
      if (looksLikeApiKey(bearer)) {
        const keyUser = await findUserByApiKey(db, bearer).catch(() => null);
        if (keyUser) {
          req.user = {
            id: keyUser.id,
            clerkUserId: keyUser.clerkUserId,
            role: keyUser.role,
            orgId: keyUser.orgId,
            email: keyUser.email,
            name: keyUser.name,
            isAdmin: false, // admin is a live Clerk-session permission, never granted via API key
          };
          return next();
        }
        // A key-shaped token that resolves to nobody is an invalid credential — reject outright
        // rather than silently trying Clerk (which would also fail, but with a confusing path).
        return res.status(401).json({ error: "Invalid API key" });
      }

      // ---- Dev stub: no Clerk configured → fake identity (LOCAL, opt-in ONLY). ----
      if (!clerkEnabled) {
        if (!devStubAllowed) {
          console.error("[orbis] SECURITY: Clerk keys missing and ORBIS_DEV_STUB!=1 — refusing to auth (no dev-stub fallback).");
          return res.status(401).json({ error: "Unauthenticated" });
        }
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
