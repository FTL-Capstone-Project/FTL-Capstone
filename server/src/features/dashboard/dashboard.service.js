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

const RECENT_LIMIT = 4; // "My Recent Submissions" rows
const ACTIVITY_LIMIT = 6; // right-rail activity feed rows
const HISTORY_DAYS = 30; // "My Submission History" bar chart window
const NEW_DOMAIN_DAYS = 30; // a domain younger than this is a "brand-new domain" red flag
const THREAT_TYPE_LIMIT = 6; // how many threat-type bars to send the chart

// aiTags is stored as JSON — normalize whatever we get back to a plain string array.
const tagsOf = (indicator) => (Array.isArray(indicator.aiTags) ? indicator.aiTags : []);

// ---- small date helpers (UTC, no external dep) ----
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
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

  const weekStart = daysAgo(7);
  const prevWeekStart = daysAgo(14);
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
  // Count UNIQUE checks (deduped), NOT raw submissions — so this tile agrees with the
  // "My Results" donut, "Threats Found", and "Safe Rate", which all count unique links.
  // (Re-checking the same link is a cache hit, not a new check, so it shouldn't inflate
  // the count past what the donut shows. This was the "tile says 2, chart shows 1" bug.)
  const thisWeekCount = uniqueChecks.filter((s) => s.createdAt >= weekStart).length;
  const lastWeekCount = uniqueChecks.filter(
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

  // "Safe rate" = share of my unique checks that came back safe. This is an honest
  // engagement stat (higher = fewer of the links I ran into were risky) and — unlike
  // the old avg-score tile — it never punishes someone for diligently checking scams.
  const scored = uniqueChecks.filter((s) => s.indicator.aiScore != null);
  const safeCount = scored.filter((s) => scoreBucket(s.indicator.aiScore) === "safe").length;
  const safeRate = scored.length === 0 ? null : Math.round((safeCount / scored.length) * 100);

  // "Top threat type" = the aiTags category that shows up most across my RISKY checks
  // (dangerous + review bands). This is the single most useful thing a personal user can
  // learn — "you keep getting hit with credential phishing" — and aiTags is set on every
  // AI verdict, so it's reliable (unlike the key-dependent urlscan/Safe-Browsing signals).
  const riskyChecks = uniqueChecks.filter((s) => scoreBucket(s.indicator.aiScore) !== "safe");
  const tagCounts = new Map();
  for (const s of riskyChecks) {
    for (const tag of tagsOf(s.indicator)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const threatTypes = [...tagCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, THREAT_TYPE_LIMIT);
  const topThreatType = threatTypes[0]?.label ?? null;

  const stats = {
    checksThisWeek: { value: thisWeekCount, trend: trend(thisWeekCount, lastWeekCount) },
    threatsFound: { value: threatsThisWeek, trend: trend(threatsThisWeek, threatsLastWeek) },
    safeRate, // 0-100 percent, or null (→ empty state on the client)
    topThreatType, // most common risky-check category, or null if I've hit no threats
  };

  // ---- Threat types the user keeps running into (drives a small bar chart) ----
  // Already computed above as `threatTypes` (top N by frequency across risky checks).

  // ---- Red flags detected across ALL my unique checks ----
  // These are deterministic signals urlscan / Safe Browsing attached to the indicator.
  // NOTE: they're key-dependent (stub to false/null when the external key is unset), so
  // the client only renders the ones with a non-zero count — a fresh deploy without keys
  // simply shows fewer flags instead of a wall of misleading zeros.
  const redFlags = {
    knownBad: uniqueChecks.filter((s) => s.indicator.blacklistHit).length,
    redirect: uniqueChecks.filter((s) => s.indicator.redirectedToDifferentHost).length,
    newDomain: uniqueChecks.filter(
      (s) => s.indicator.domainAgeDays != null && s.indicator.domainAgeDays < NEW_DOMAIN_DAYS
    ).length,
  };

  // ---- Where my threats arrive: web checks vs forwarded emails (source) ----
  // `source` is set by real app code on every submission, so this split is always accurate.
  const channels = {
    web: submissions.filter((s) => s.source !== "email").length,
    email: submissions.filter((s) => s.source === "email").length,
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

  return { stats, submissionHistory, results, recentSubmissions, activity, threatTypes, redFlags, channels };
}
