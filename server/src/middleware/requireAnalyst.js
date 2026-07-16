// Role guard for analyst-only routes (analyst track). Reused across /history, /search, etc.
// Runs AFTER requireAuth (which sets req.user). "admin" users are analysts too
// (admin = Clerk org:admin permission layered on the analyst role), so isAnalyst covers them.
import { isAnalyst } from "./roles.js";

export const requireAnalyst = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }
  if (!isAnalyst(req.user.role)) {
    return res.status(403).json({ error: "Analyst role required" });
  }
  next();
}
