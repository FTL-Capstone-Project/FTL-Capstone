// ── feature: dashboard · service · owner: Michael ──
// Pure data-shaping for the PERSONAL dashboard (no Express here → easy to test).
// Everything is scoped to ONE user (story #12 isolation): the caller passes their
// own userId; we never read another user's rows.
//
// The page (Dashboard.jsx) does ONE fetch → GET /api/dashboard → getDashboard(userId)
// → this file → Prisma → Postgres. Response shape (agreed in the plan discussion):
//   { stats, submissionHistory[], results, recentSubmissions[], activity[] }
//
// Score semantics: 0-100 SAFETY score (100 = safe). Bands come from David's
// scoreBucket() in services/verdict.js so the dashboard ALWAYS agrees with the
// Reports page + the check result (single source of truth for the thresholds).
import { prisma } from "../../db.js";
import { scoreBucket } from "../../services/verdict.js";

const MONTHLY_QUOTA = 50; // display-only cap shown on the "Checks Remaining" tile (not enforced)
const RECENT_LIMIT = 4; // "My Recent Submissions" rows
const ACTIVITY_LIMIT = 6; // right-rail activity feed rows
const HISTORY_DAYS = 30; // "My Submission History" bar chart window

// ---- small date helpers (UTC, no external dep) ----
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
const startOfThisMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
const ymd = (date) => {
  return date.toISOString().slice(0, 10); // "2026-07-14"
}

// Percent change this-period vs last-period. Returns { pct, direction } where
// direction is "up" | "down" | "flat". null baseline (no prior data) → flat 0.
const trend = (current, previous) => {
  if (previous === 0) {
    if (current === 0) return { pct: 0, direction: "flat" };
    return { pct: 100, direction: "up" }; // grew from nothing
  }
  const change = ((current - previous) / previous) * 100;
  const pct = Math.round(Math.abs(change) * 10) / 10; // 1 decimal
  return { pct, direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

/**
 * Build the entire personal dashboard payload for one user.
 * @param {number} userId  req.user.id (the verified caller)
 */
export const getDashboard = async (userId) => {
  // Pull every submission for this user ONCE, with the joined global indicator
  // (score/verdict/title live on the indicator). We derive most widgets from this
  // in-memory list — cheap for a personal account, and avoids many round-trips.
  const submissions = await prisma.submission.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { indicator: true },
  });

  const now = new Date();
  const weekStart = daysAgo(7);
  const prevWeekStart = daysAgo(14);
  const monthStart = startOfThisMonth();
  const historyStart = daysAgo(HISTORY_DAYS - 1); // inclusive of today → 30 buckets

  // ---- de-dupe to unique indicators for the "results" + "recent" widgets ----
  // (If I checked the same link 3 times, it's ONE result, newest kept — matches
  //  how the Reports page dedupes.)
  const seenIndicator = new Set();
  const uniqueChecks = []; // newest-first, one per indicator
  for (const s of submissions) {
    if (seenIndicator.has(s.indicatorId)) continue;
    seenIndicator.add(s.indicatorId);
    uniqueChecks.push(s);
  }

  // ---- stat tiles ----
  const thisWeekCount = submissions.filter((s) => s.createdAt >= weekStart).length;
  const lastWeekCount = submissions.filter(
    (s) => s.createdAt >= prevWeekStart && s.createdAt < weekStart
  ).length;

  // "Threats found" = unique checks that came back dangerous.
  const dangerousChecks = uniqueChecks.filter(
    (s) => scoreBucket(s.indicator.aiScore) === "dangerous"
  );
  const threatsThisWeek = dangerousChecks.filter((s) => s.createdAt >= weekStart).length;
  const threatsLastWeek = dangerousChecks.filter(
    (s) => s.createdAt >= prevWeekStart && s.createdAt < weekStart
  ).length;

  // "My safety score" = average aiScore across my scored unique checks (100 = safe).
  const scored = uniqueChecks.filter((s) => s.indicator.aiScore != null);
  const safetyScore =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((sum, s) => sum + s.indicator.aiScore, 0) / scored.length);

  // "Checks remaining" = display-only usage this calendar month vs the quota.
  const usedThisMonth = submissions.filter((s) => s.createdAt >= monthStart).length;

  const stats = {
    checksThisWeek: { value: thisWeekCount, trend: trend(thisWeekCount, lastWeekCount) },
    threatsFound: { value: threatsThisWeek, trend: trend(threatsThisWeek, threatsLastWeek) },
    safetyScore, // number 0-100 or null (→ empty state on the client)
    checksRemaining: { used: usedThisMonth, limit: MONTHLY_QUOTA }, // display-only
  };

  // ---- My Results donut (unique checks grouped by verdict band) ----
  const results = { safe: 0, suspicious: 0, dangerous: 0, total: uniqueChecks.length };
  for (const s of uniqueChecks) {
    const bucket = scoreBucket(s.indicator.aiScore); // safe | review | dangerous
    if (bucket === "safe") results.safe += 1;
    else if (bucket === "dangerous") results.dangerous += 1;
    else results.suspicious += 1; // "review" band = Suspicious slice
  }

  // ---- My Submission History (last 30 days, one bucket per day incl. empty days) ----
  const byDay = new Map();
  for (let i = 0; i < HISTORY_DAYS; i++) byDay.set(ymd(daysAgo(HISTORY_DAYS - 1 - i)), 0);
  for (const s of submissions) {
    if (s.createdAt < historyStart) continue;
    const key = ymd(s.createdAt);
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + 1);
  }
  const submissionHistory = [...byDay.entries()].map(([date, count]) => ({ date, count }));

  // ---- My Recent Submissions (latest N unique checks) ----
  const recentSubmissions = uniqueChecks.slice(0, RECENT_LIMIT).map((s) => ({
    indicatorId: s.indicatorId,
    title: s.indicator.aiTitle ?? s.rawUrl,
    domain: s.indicator.domain,
    score: s.indicator.aiScore, // number | null
    kind: scoreBucket(s.indicator.aiScore), // safe | review | dangerous
    status: s.indicator.status, // pending | scanning | done | error
    createdAt: s.createdAt,
  }));

  // ---- My Activity feed (recent submissions + notifications, merged, newest-first) ----
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: ACTIVITY_LIMIT,
  });

  const submissionEvents = submissions.slice(0, ACTIVITY_LIMIT).map((s) => ({
    kind: "submission",
    label:
      s.indicator.status === "done"
        ? "Verification complete"
        : s.indicator.status === "error"
          ? "Scan needs manual review"
          : "Analysis requested",
    subject: s.indicator.aiTitle ?? s.rawUrl,
    at: s.createdAt,
  }));
  const notificationEvents = notifications.map((n) => ({
    kind: "notification",
    label: "Update",
    subject: n.message,
    at: n.createdAt,
  }));

  const activity = [...submissionEvents, ...notificationEvents]
    .sort((a, b) => b.at - a.at)
    .slice(0, ACTIVITY_LIMIT);

  return { stats, submissionHistory, results, recentSubmissions, activity };
}
