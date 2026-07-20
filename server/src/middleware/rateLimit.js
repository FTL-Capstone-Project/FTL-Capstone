// ── middleware: rate limit · owner: David ──
// A tiny, DEPENDENCY-FREE per-user rate limiter for the cost-bearing routes (each request
// there fires a urlscan scan / Safe Browsing lookup / Claude call, which cost real money and
// quota). Without this, a logged-in user can loop unique URLs and drain the urlscan free tier
// and Claude budget in minutes (denial-of-wallet, OWASP LLM04 / A04 unbounded consumption).
//
// We keep it in-memory + no library on purpose (the team's no-extra-deps norm; fine for a
// single-instance capstone demo). A real multi-instance deploy would use a shared store
// (Redis) or an API-gateway limit — noted for the deploy checklist.
//
// Keyed on req.user.id, so it must run AFTER requireAuth. Sliding-window: we keep each user's
// recent request timestamps and count how many fall inside the window.

// Create a limiter. windowMs = window size; max = allowed requests per window per user.
export const rateLimit = ({ windowMs = 60_000, max = 20 } = {}) => {
  const hits = new Map(); // userId → number[] (request timestamps within the window)

  // Periodically drop stale entries so the Map can't grow unbounded over a long uptime.
  // unref() so this timer never keeps the process alive on its own (and tests can exit).
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, windowMs);
  if (typeof sweeper.unref === "function") sweeper.unref();

  return (req, res, next) => {
    // Fall back to IP if somehow unauthenticated (shouldn't happen behind requireAuth).
    const key = String(req.user?.id ?? req.ip ?? "anon");
    const now = Date.now();
    const cutoff = now - windowMs;

    const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= max) {
      // Tell the client when to retry (seconds until the oldest hit ages out).
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "You're checking too fast. Give me a moment and try again shortly.",
        retryAfter: retryAfterSec,
      });
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
};
