// Role guard for analyst-only routes (analyst track). Reused across /history, /search, etc.
export function requireAnalyst(req, res, next) {
  if (req.user?.role !== "analyst") {
    return res.status(403).json({ error: "Analyst role required" });
  }
  next();
}
