// ── feature: history · owner: Ozias (personal ?mine=1 + org ?org=1) / analyst track (org-wide stats) ──
// GET /api/history?mine=1 — the caller's own reports (personal "My History"). §6.
// GET /api/history?org=1  — the caller's whole ORGANIZATION's reports ("Team History").
//
// This is the data source for my Reports screen. Flow:
//   Reports.jsx → api.get("/api/history?mine=1" | "?org=1") → HERE → Prisma → Postgres → back.
// requireAuth (Michael's middleware) puts the verified user on req.user, so we
// only ever return submissions the caller is allowed to see (story #12 data
// isolation): ?mine=1 = their own rows; ?org=1 = rows scoped to THEIR org only.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { isAnalyst } from "../../middleware/roles.js";
import { prisma } from "../../db.js";
import { toReportJson, setArchivedForUser, deleteForUser } from "./history.service.js";
import { scoreBucket } from "../../services/verdict.js";

export const historyRouter = Router();

// ── small helpers for the analyst stats branch ──
const TOP_TARGETED_LIMIT = 5;  // "Top Targeted" host bars
const THREAT_TYPE_LIMIT = 6;   // "Threat Types" bars
const TOP_REPORTER_LIMIT = 5;  // "Top Reporters" list
const NEW_DOMAIN_DAYS = 30;    // a domain younger than this is a "brand-new domain" red flag (matches personal)
const ACTIVITY_LIMIT = 10;     // right-rail "Team Activity" feed rows
const TREND_DAYS = 30;         // submission-trend window — matches the personal dashboard's 30-day history so
                               // real-but-older org data still shows (a low-traffic org rarely has 7 fresh days)

// Midnight UTC, n days ago (used for the 7-day / prior-7-day windows).
const startOfDayUtc = (daysBack) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
};

// Percent change current-vs-previous period → { pct, direction }. Mirrors the personal
// dashboard's trend() so the analyst trend chips read identically. null baseline → flat.
const pctTrend = (current, previous) => {
  if (previous === 0) {
    if (current === 0) return { pct: 0, direction: "flat" };
    return { pct: 100, direction: "up" };
  }
  const change = ((current - previous) / previous) * 100;
  const pct = Math.round(Math.abs(change) * 10) / 10;
  return { pct, direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
};

// SAFETY CEILING on the history reads below — not pagination.
//
// Every list query here was unbounded: "give me every submission this user/org ever made", joined
// with the indicator (and the reporter), then deduped in JS. Cost therefore grew linearly with
// account age forever, and the analyst triage queue re-paid it on every visit. The largest org today
// has 25 submissions, so this ceiling is ~20x current data — it changes nothing you can see now, it
// just stops one busy org from eventually serving a multi-megabyte JSON blob (and stops a runaway
// seed script from taking the page down).
//
// The REAL fix is cursor pagination on these endpoints; that's a UI change too (infinite scroll or
// pages), so it's deliberately out of scope here. If an org ever legitimately exceeds this, the cards
// beyond the ceiling silently stop appearing — so raise it or paginate before that happens.
const MAX_HISTORY_ROWS = 500;

historyRouter.get("/", requireAuth, async (req, res, next) => {
  const mine = req.query.mine === "1";
  const orgWide = req.query.org === "1";
  // My History has two lists: active (default) and archived (?archived=1). Archived items are
  // hidden from the default view but not deleted — flipping this filter reveals them so the user
  // can restore or permanently remove them. Only affects THIS caller's own view.
  const showArchived = req.query.archived === "1";

  try {
    if (mine) {
      // 1) My submissions, newest first, with the joined GLOBAL indicator (score / verdict /
      //    status / screenshot live on the indicator). Default hides archived rows; ?archived=1
      //    flips to show ONLY archived ones. archivedAt is my own soft-archive flag (per-user).
      const submissions = await prisma.submission.findMany({
        where: {
          userId: req.user.id,
          archivedAt: showArchived ? { not: null } : null,
        },
        orderBy: { createdAt: "desc" },
        include: { indicator: true },
        take: MAX_HISTORY_ROWS, // ceiling, not pagination — see MAX_HISTORY_ROWS
      });

      // A card is per-indicator but archivedAt is per-submission, so a user who archived a link
      // and later RE-CHECKED it has two rows for one indicator: an archived one + a fresh active
      // one. Without this, that indicator would show in BOTH the Active and Archived tabs. Rule:
      // an indicator with ANY active submission belongs to Active only — so when building the
      // Archived list, skip indicators that also have a live (unarchived) submission.
      let activeIndicatorIds = new Set();
      if (showArchived) {
        const active = await prisma.submission.findMany({
          where: { userId: req.user.id, archivedAt: null },
          select: { indicatorId: true },
          take: MAX_HISTORY_ROWS,
        });
        activeIndicatorIds = new Set(active.map((s) => s.indicatorId));
      }

      // 2) If I'm in an org, fetch my org's private reviews for those indicators
      //    in ONE query, then look them up by indicatorId (avoids N+1 queries).
      let reviewsByIndicator = new Map();
      if (req.user.orgId) {
        const indicatorIds = submissions.map((s) => s.indicatorId);
        const reviews = await prisma.orgReview.findMany({
          where: { orgId: req.user.orgId, indicatorId: { in: indicatorIds } },
          include: { reviewedByUser: true }, // to show which analyst closed it
        });
        reviewsByIndicator = new Map(reviews.map((r) => [r.indicatorId, r]));
      }

      // 3) One card per unique indicator (dedup: if I checked the same link
      //    twice, show it once — keep the newest, which is first after the sort).
      const seen = new Set();
      const reports = [];
      for (const submission of submissions) {
        if (seen.has(submission.indicatorId)) continue;
        // Archived view: an indicator that also has a live submission belongs to Active, not here.
        if (showArchived && activeIndicatorIds.has(submission.indicatorId)) continue;
        seen.add(submission.indicatorId);
        const review = reviewsByIndicator.get(submission.indicatorId) ?? null;
        reports.push(toReportJson(submission, review, req.user.name));
      }

      return res.json({ reports });
    }

    if (orgWide) {
      // "Team History": everything my whole org has reported, so a member can
      // see what scams the organization has been running into lately.
      // Individuals (no org) have no team → return an empty list, not an error.
      if (!req.user.orgId) {
        return res.json({ reports: [] });
      }

      // ANALYST TRIAGE MODE (?org=1&all=1): an analyst needs the FULL org queue —
      // including items still pending/investigating (not yet shared). We drop the
      // shared-only gate and show every org report so they have something to triage.
      // Guarded by role: only an analyst may see unshared reviews (story #12). A
      // member passing all=1 is ignored → they still get the shared-only Team History.
      const triageMode = req.query.all === "1" && isAnalyst(req.user.role);

      // 1) Every submission in MY org, newest first, with the joined global
      //    indicator AND the teammate who reported it (for "Reported by <name>").
      const submissions = await prisma.submission.findMany({
        where: { orgId: req.user.orgId },
        orderBy: { createdAt: "desc" },
        include: { indicator: true, user: true },
        take: MAX_HISTORY_ROWS, // ceiling, not pagination — see MAX_HISTORY_ROWS
      });

      // 2) My org's reviews for those indicators. In normal Team History we fetch
      //    ONLY analyst-SHARED reviews (sharedWithOrg = true) — the privacy gate, so
      //    nothing with personal info leaks org-wide without a deliberate decision.
      //    In analyst triage mode we fetch ALL of the org's reviews (any status),
      //    so pending/investigating items are visible for triage.
      //    One query, same N+1-avoiding pattern as the ?mine=1 branch above.
      const indicatorIds = submissions.map((s) => s.indicatorId);
      const reviews = await prisma.orgReview.findMany({
        where: {
          orgId: req.user.orgId,
          indicatorId: { in: indicatorIds },
          ...(triageMode ? {} : { sharedWithOrg: true }),
        },
        include: { reviewedByUser: true }, // to show which analyst reviewed it
      });
      const reviewsByIndicator = new Map(reviews.map((r) => [r.indicatorId, r]));

      // 3) One card per unique indicator (dedup: if two teammates checked the
      //    same link, show it once — keep the newest, which is first after sort).
      const seen = new Set();
      const reports = [];
      for (const submission of submissions) {
        if (seen.has(submission.indicatorId)) continue;
        const review = reviewsByIndicator.get(submission.indicatorId) ?? null;
        // Normal Team History hides anything without a shared review. Triage mode
        // shows every org report (even those with NO review yet → review stays null,
        // which the queue treats as top-priority "needs review").
        if (!triageMode && !review) continue;
        seen.add(submission.indicatorId);
        // Reporter name comes from THIS submission's user (a teammate), not me.
        reports.push(toReportJson(submission, review, submission.user?.name));
      }

      return res.json({ reports });
    }

    // ── Analyst dashboard stats branch ────────────────────────────────────────
    // GET /api/history (no ?mine/?org) → org-scoped stats for the analyst dashboard.
    // Analyst-only: non-analysts get 403, no data leaks.
    // All queries are parameterized and scoped to req.user.orgId (story #12).

    // The analyst check runs as an inline guard here (not a global route middleware)
    // so the ?mine and ?org branches above stay accessible to all roles.
    if (!req.user || !isAnalyst(req.user.role)) {
      return res.status(403).json({ error: "Analyst role required" });
    }
    if (!req.user.orgId) {
      // An analyst with no org shouldn't happen in prod; return gracefully rather
      // than crash with a Prisma error on orgId=null.
      return res.json({ stats: {}, recent: [] });
    }

    const orgId = req.user.orgId;

    // Window bounds (UTC) reused across the stats below.
    const weekStart = startOfDayUtc(6);   // last 7 days incl. today
    const prevWeekStart = startOfDayUtc(13); // the 7 days before that

    // The reads below are INDEPENDENT of each other, so we fire them CONCURRENTLY with Promise.all
    // instead of awaiting each in turn. They used to run as sequential `await`s, making the
    // dashboard's latency the SUM of several round trips to a serverless Postgres that sits a long
    // way from the API; batched, the latency is the slowest single query instead — the cheapest
    // latency win on this endpoint. (The JS aggregation afterwards is unchanged; only waiting is parallel.)
    const [verdictIndicators, allOrgSubmissions, orgReviews, recentActivity] = await Promise.all([
      // 1. Verdict-breakdown source. Query the DISTINCT INDICATORS this org has submitted (an
      //    indicator is one row, so this is already deduped — no JS Set pass, and no arbitrary cap).
      //    This deliberately does NOT reuse the capped submission read below: verdictBreakdown is an
      //    AUTHORITATIVE COUNT shown on the dashboard, so a take-ceiling would silently UNDERCOUNT it
      //    (and, on an unordered query, over a skewed subset). Payload is just the aiScore ints, so
      //    this stays cheap even for a big org — cheaper than scanning every submission would be.
      prisma.indicator.findMany({
        where: { submissions: { some: { orgId } } },
        select: { aiScore: true },
      }),
      // 2. Every org submission (newest first), widened to carry createdAt + the indicator's
      //    domain/finalHost/aiTags + the deterministic red-flag signals, so threats-this-week, top
      //    targeted hosts, the threat-type mix, the AI-confidence mix, red flags, channels, top
      //    reporters, AND the 30-day trend all derive from this single in-memory list. (Avoids a raw
      //    GROUP BY Prisma can't express, keeping queries parameterized.) Capped by MAX_HISTORY_ROWS
      //    — a safety ceiling, not pagination; see the constant above.
      prisma.submission.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" }, // newest first → dedup keeps the latest submission
        take: MAX_HISTORY_ROWS, // ceiling, not pagination — see MAX_HISTORY_ROWS
        select: {
          indicatorId: true,
          createdAt: true,
          source: true, // web | email → org-wide channel split
          user: { select: { name: true } }, // reporter → "Top Reporters"
          indicator: {
            select: {
              aiScore: true, domain: true, finalHost: true, aiTags: true,
              // AI-confidence mix + the deterministic red-flag signals (key-dependent —
              // stub to false/null without urlscan / Safe-Browsing keys, so the client
              // only renders the flags with a non-zero count, same as the personal view).
              aiConfidence: true, blacklistHit: true, redirectedToDifferentHost: true, domainAgeDays: true,
            },
          },
        },
      }),
      // 3. Every review in the org (newest first) with the joined AI score — powers the pending age,
      //    throughput, AI-agreement, calibration, turnaround and shared-rate stats below. Scoped to
      //    orgId (story #12); no personal item is exposed — these are counts + a percentage, plus the
      //    oldest pending item's age in days. Capped by MAX_HISTORY_ROWS for the same safety reason as
      //    the submission read above.
      prisma.orgReview.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" }, // deterministic subset if we ever hit the ceiling
        take: MAX_HISTORY_ROWS, // ceiling, not pagination — see MAX_HISTORY_ROWS
        select: {
          indicatorId: true,   // → map a review's status back onto its queue row
          reviewStatus: true,
          humanScore: true,
          sharedWithOrg: true, // → shared-rate (how much of the queue reached the team)
          createdAt: true,
          updatedAt: true,
          indicator: { select: { aiScore: true } },
        },
      }),
      // 4. Recent activity feed (last N org submissions, newest first). Already bounded by take.
      prisma.submission.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_LIMIT,
        include: {
          indicator: { select: { aiTitle: true, domain: true, aiScore: true, screenshotUrl: true } },
          user: { select: { name: true } },
        },
      }),
    ]);

    // Dedup the submission list to unique indicators (same URL reported multiple times = one check).
    // Newest-first order above means we keep each indicator's most recent submission.
    const seenForStats = new Set();
    const uniqueChecks = []; // { indicatorId, createdAt, indicator }
    for (const s of allOrgSubmissions) {
      if (seenForStats.has(s.indicatorId)) continue;
      seenForStats.add(s.indicatorId);
      uniqueChecks.push(s);
    }
    const uniqueIndicators = uniqueChecks.map((s) => s.indicator);

    // ── 1. Verdict breakdown ─────────────────────────────────────────────────
    // verdictIndicators is already one row per unique indicator (deduped by the query above) and
    // uncapped, so this is the AUTHORITATIVE safe/review/dangerous split shown on the dashboard.
    const verdictBreakdown = { safe: 0, review: 0, dangerous: 0, total: verdictIndicators.length };
    for (const ind of verdictIndicators) {
      const band = scoreBucket(ind.aiScore); // safe | review | dangerous
      verdictBreakdown[band] = (verdictBreakdown[band] ?? 0) + 1;
    }

    // Threats this week vs last week (unique dangerous indicators, by newest submission).
    const dangerousChecks = uniqueChecks.filter((s) => scoreBucket(s.indicator.aiScore) === "dangerous");
    const threatsThisWeekCount = dangerousChecks.filter((s) => s.createdAt >= weekStart).length;
    const threatsPrevWeekCount = dangerousChecks.filter(
      (s) => s.createdAt >= prevWeekStart && s.createdAt < weekStart
    ).length;

    // Top targeted hosts — where dangerous links actually land (finalHost ?? domain).
    // Tells the analyst which brands/domains are being weaponized against the org.
    const targetCounts = new Map();
    for (const s of dangerousChecks) {
      const host = s.indicator.finalHost ?? s.indicator.domain;
      if (!host) continue;
      targetCounts.set(host, (targetCounts.get(host) ?? 0) + 1);
    }
    const topTargeted = [...targetCounts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_TARGETED_LIMIT);

    // Threat-type mix — aiTags frequency across risky (dangerous + review) indicators.
    const riskyChecks = uniqueChecks.filter((s) => scoreBucket(s.indicator.aiScore) !== "safe");
    const tagCounts = new Map();
    for (const s of riskyChecks) {
      const tags = Array.isArray(s.indicator.aiTags) ? s.indicator.aiTags : [];
      for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const threatTypes = [...tagCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, THREAT_TYPE_LIMIT);

    // AI-confidence mix — how sure the AI was across the org's unique checks. Low-confidence
    // verdicts are exactly the ones an analyst should eyeball first, so this is triage fuel,
    // not vanity. aiConfidence is set on every AI verdict → reliable. Unknown (null) is kept
    // as its own bucket rather than silently dropped, so the totals always add up.
    const confidenceMix = { high: 0, medium: 0, low: 0, unknown: 0 };
    for (const ind of uniqueIndicators) {
      const c = ind.aiConfidence; // "low" | "medium" | "high" | null
      if (c === "high" || c === "medium" || c === "low") confidenceMix[c] += 1;
      else confidenceMix.unknown += 1;
    }

    // Org-wide red flags — the same deterministic signals the personal view surfaces, but
    // across every org indicator. Key-dependent: these stub to false/null without the
    // urlscan / Safe-Browsing keys, so the client renders ONLY the non-zero ones.
    const redFlags = {
      knownBad: uniqueChecks.filter((s) => s.indicator.blacklistHit).length,
      redirect: uniqueChecks.filter((s) => s.indicator.redirectedToDifferentHost).length,
      newDomain: uniqueChecks.filter(
        (s) => s.indicator.domainAgeDays != null && s.indicator.domainAgeDays < NEW_DOMAIN_DAYS
      ).length,
    };

    // Channel split — where the org's reports arrive (web check vs forwarded email). Counted
    // per submission (not deduped): each forward/check is its own arrival event, matching the
    // personal dashboard's channel semantics. `source` is set by real app code on every row.
    const channels = {
      web: allOrgSubmissions.filter((s) => s.source !== "email").length,
      email: allOrgSubmissions.filter((s) => s.source === "email").length,
    };

    // Top reporters — who on the team is surfacing the most links. Counted per submission so a
    // teammate who reports often ranks higher; anonymous/nameless rows fold into "Unknown".
    const reporterCounts = new Map();
    for (const s of allOrgSubmissions) {
      const name = s.user?.name ?? "Unknown";
      reporterCounts.set(name, (reporterCounts.get(name) ?? 0) + 1);
    }
    const topReporters = [...reporterCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_REPORTER_LIMIT);

    // ── 2. 30-day submission trend ────────────────────────────────────────────
    // Count all org submissions per day over the past 30 days (incl. today). We use a
    // 30-day window (not 7) to match the personal dashboard's history chart: a low-traffic
    // org often has no submissions in the last 7 days, which made the chart read "empty"
    // even though there was real, recent-ish data. Built from allOrgSubmissions (already
    // fetched, every submission — NOT deduped) so this costs no extra query and keeps the
    // old behavior of counting each submission, matching the personal history chart.
    const trendStart = startOfDayUtc(TREND_DAYS - 1); // inclusive of today → TREND_DAYS buckets

    // Build a bucket per day (ISO date string) so zero-count days appear.
    const trendMap = new Map();
    for (let i = 0; i < TREND_DAYS; i++) {
      const d = new Date(trendStart);
      d.setUTCDate(d.getUTCDate() + i);
      trendMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const { createdAt } of allOrgSubmissions) {
      if (createdAt < trendStart) continue;
      const key = new Date(createdAt).toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.set(key, trendMap.get(key) + 1);
    }
    const trend = [...trendMap.entries()].map(([date, count]) => ({ date, count }));

    // ── 3. Review-based stats: pending age, throughput, AI agreement ──────────
    // All derive from orgReviews (fetched in the batch above). Scoped to orgId (story #12); no
    // personal item is exposed — these are counts + a percentage, plus the oldest pending item's age.

    // Look up a review's status by indicator so the recent-activity queue shows the REAL
    // state (pending / investigating / confirmed …) instead of assuming everything is pending.
    const reviewStatusByIndicator = new Map(orgReviews.map((r) => [r.indicatorId, r.reviewStatus]));

    // Pending: count + how stale the oldest one is (triage by age, not just volume).
    const pendingReviews = orgReviews.filter((r) => r.reviewStatus === "pending review");
    const pendingCount = pendingReviews.length;
    let oldestPendingDays = 0;
    for (const r of pendingReviews) {
      const ageDays = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86_400_000);
      if (ageDays > oldestPendingDays) oldestPendingDays = ageDays;
    }

    // Throughput: reviews CLOSED (moved off "pending review") this week vs last week.
    // We approximate "closed" via updatedAt on a non-pending review — good enough for a
    // throughput pulse without a dedicated closedAt column.
    const closedReviews = orgReviews.filter((r) => r.reviewStatus !== "pending review");
    const reviewedThisWeek = closedReviews.filter((r) => r.updatedAt >= weekStart).length;
    const reviewedPrevWeek = closedReviews.filter(
      (r) => r.updatedAt >= prevWeekStart && r.updatedAt < weekStart
    ).length;

    // AI agreement: of the reviews where an analyst gave a humanScore, how often does the
    // analyst's band match the AI's band? This is the "how much can I trust the AI triage"
    // number — unique to Orbis and 100% computable from data we already store.
    const scoredReviews = closedReviews.filter(
      (r) => r.humanScore != null && r.indicator?.aiScore != null
    );
    let agreeCount = 0;
    let biasSum = 0; // Σ(humanScore − aiScore): >0 = analyst scores SAFER, <0 = STRICTER than AI
    for (const r of scoredReviews) {
      if (scoreBucket(r.humanScore) === scoreBucket(r.indicator.aiScore)) agreeCount += 1;
      biasSum += r.humanScore - r.indicator.aiScore;
    }
    const aiAgreement =
      scoredReviews.length === 0
        ? null // no analyst-scored reviews yet → client shows an empty state
        : { pct: Math.round((agreeCount / scoredReviews.length) * 100), sample: scoredReviews.length };

    // Score calibration — on average, how far the analyst's score sits from the AI's on the
    // SAME item. Signed: positive = the team tends to score items SAFER than the AI, negative =
    // STRICTER. More nuanced than the agreement % (which only checks same-band), and it's the
    // number that tells an analyst whether to trust or second-guess the AI's severity.
    const scoreCalibration =
      scoredReviews.length === 0
        ? null
        : { avgDelta: Math.round((biasSum / scoredReviews.length) * 10) / 10, sample: scoredReviews.length };

    // Review turnaround — average days from a review opening (createdAt) to closing (updatedAt),
    // across CLOSED reviews. A throughput/SLA pulse: "how long does a report wait for a verdict?"
    // updatedAt approximates closedAt (no dedicated column), same as the throughput counts above.
    let turnaroundSum = 0;
    for (const r of closedReviews) {
      const days = (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 86_400_000;
      if (days >= 0) turnaroundSum += days;
    }
    const avgTurnaroundDays =
      closedReviews.length === 0
        ? null
        : Math.round((turnaroundSum / closedReviews.length) * 10) / 10;

    // Shared rate — of the reviews an analyst has CLOSED, how many were flagged shareable so the
    // team can see the verdict (the privacy gate). Low = verdicts are landing but staying private;
    // a nudge to share more so members benefit from the analyst's work.
    const sharedClosedCount = closedReviews.filter((r) => r.sharedWithOrg).length;
    const sharedRate =
      closedReviews.length === 0
        ? null
        : { pct: Math.round((sharedClosedCount / closedReviews.length) * 100), shared: sharedClosedCount, closed: closedReviews.length };

    // ── 4. Recent activity feed (last N org submissions, newest first) ────────
    // recentActivity was fetched in the batch above.
    const recent = recentActivity.map((s) => ({
      indicatorId: s.indicatorId,
      title: s.indicator.aiTitle ?? s.rawUrl,
      domain: s.indicator.domain,
      score: s.indicator.aiScore,
      kind: scoreBucket(s.indicator.aiScore),
      reporter: s.user?.name ?? null,
      screenshotUrl: s.indicator.screenshotUrl ?? null, // real sandbox thumbnail (null → grey placeholder)
      // The analyst's real review state for this indicator. No review row yet → still needs a
      // first look, so default to "pending review" (what the auto-escalation queue starts at).
      reviewStatus: reviewStatusByIndicator.get(s.indicatorId) ?? "pending review",
      createdAt: s.createdAt,
    }));

    // Same rows, reshaped for the shared right-rail ActivityRail (which every dashboard
    // variant now renders). It expects { kind, label, subject, at }; for the analyst the
    // feed is TEAM-wide, so the label names the teammate who reported each link.
    const activity = recentActivity.map((s) => ({
      kind: "submission",
      label: s.user?.name ? `Reported by ${s.user.name}` : "New report",
      subject: s.indicator.aiTitle ?? s.rawUrl,
      at: s.createdAt,
    }));

    return res.json({
      stats: {
        verdictBreakdown,  // { safe, review, dangerous, total }
        trend,             // [{ date: "YYYY-MM-DD", count: N }, ×7]
        pendingCount,      // number — indicators awaiting analyst review
        oldestPendingDays, // age (days) of the oldest pending review → triage by staleness
        threatsThisWeek: { value: threatsThisWeekCount, trend: pctTrend(threatsThisWeekCount, threatsPrevWeekCount) },
        reviewedThisWeek: { value: reviewedThisWeek, trend: pctTrend(reviewedThisWeek, reviewedPrevWeek) },
        aiAgreement,       // { pct, sample } or null — analyst vs AI band match rate
        scoreCalibration,  // { avgDelta, sample } or null — signed avg (human − AI) score gap
        avgTurnaroundDays, // number or null — mean days from review open → close
        sharedRate,        // { pct, shared, closed } or null — closed reviews shared with the team
        topTargeted,       // [{ domain, count }] — most-attacked hosts (dangerous)
        threatTypes,       // [{ label, count }] — org-wide aiTags mix (risky)
        confidenceMix,     // { high, medium, low, unknown } — AI-confidence spread across checks
        topReporters,      // [{ name, count }] — who's surfacing the most links
        redFlags,          // { knownBad, redirect, newDomain } — org-wide deterministic signals
        channels,          // { web, email } — where the org's reports arrive
      },
      recent,              // last N org submissions with title/score/reporter (pending queue)
      activity,            // last N org submissions reshaped for the shared right rail
    });
  } catch (err) {
    return next(err);
  }
});

// ── archive / delete a user's OWN report from My History · owner: David ──
// These act on the caller's Submission rows only (WHERE pins req.user.id), never the global
// Indicator or anyone else's data — so removing my history can't hurt shared threat-intel.
// :indicatorId is the Reports card's identity (one card = one indicator), so both routes take it.

// Parse + validate the :indicatorId path param. Returns the integer, or null if it's not a
// positive whole number (→ the route answers 400 rather than running a bogus query).
const parseIndicatorId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PATCH /api/history/:indicatorId/archive — soft-archive (hide) or restore the caller's own
// report. Body: { archived: true } to archive, { archived: false } to restore. Reversible.
historyRouter.patch("/:indicatorId/archive", requireAuth, async (req, res, next) => {
  const indicatorId = parseIndicatorId(req.params.indicatorId);
  if (indicatorId == null) return res.status(400).json({ error: "Bad indicator id" });

  // Default to archiving; only an explicit `false` restores. Reject anything non-boolean so a
  // typo like archived:"false" (a truthy string) can't silently archive what the user meant to restore.
  const archived = req.body?.archived ?? true;
  if (typeof archived !== "boolean") {
    return res.status(400).json({ error: "archived must be true or false" });
  }

  try {
    const count = await setArchivedForUser(prisma, {
      userId: req.user.id,
      indicatorId,
      archived,
      now: new Date(),
    });
    // 0 rows = the caller has no submission for this indicator → nothing of theirs to touch.
    // 404 (not 403) so we don't reveal whether the indicator exists for someone else.
    if (count === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ archived, count });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/history/:indicatorId — permanently remove the caller's own report(s) for this
// indicator. Does NOT touch the global Indicator (its shared score/reportCount) or the
// ReportReason the user may have filed — this only clears MY personal history row.
//
// INDIVIDUALS ONLY. An org member's submission is auto-escalated into an OrgReview (the analyst
// queue), and Team History / triage derive their cards FROM submissions — so if a member were the
// sole reporter, a hard delete would yank the indicator out of the whole org's views and strand
// the analyst's in-progress review. Members archive instead (archiving keeps the org view intact);
// only solo individuals (no org, no analyst layer) may permanently delete.
historyRouter.delete("/:indicatorId", requireAuth, async (req, res, next) => {
  const indicatorId = parseIndicatorId(req.params.indicatorId);
  if (indicatorId == null) return res.status(400).json({ error: "Bad indicator id" });

  if (req.user.orgId != null) {
    return res.status(403).json({ error: "Org members can archive but not permanently delete reports." });
  }

  try {
    const count = await deleteForUser(prisma, { userId: req.user.id, indicatorId });
    if (count === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ deleted: count });
  } catch (err) {
    return next(err);
  }
});
