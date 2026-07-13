// ============================================================
// Auth middleware — verifies the Clerk session and attaches
// req.user = { id, role, orgId } for every protected route.
// TODO(Michael): wire real Clerk verification (@clerk/express).
// For now it's a STUB so David/Ozias can build behind it locally:
// set a fake user unless a real token is present.
// ============================================================

export function requireAuth(req, res, next) {
  // TODO(Michael): verify Bearer token with Clerk; 401 if invalid.
  // Stub identity for local dev:
  req.user = req.user ?? { id: 1, role: "individual", orgId: null };
  next();
}
