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
import { requireAnalyst } from "../../middleware/requireAnalyst.js";
import { isAnalyst, ROLES } from "../../middleware/roles.js";
import { prisma } from "../../db.js";
import { toReportJson, setArchivedForUser, deleteForUser } from "./history.service.js";
import { scoreBucket } from "../../services/verdict.js";

export const historyRouter = Router();

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
    // Guarded by requireAnalyst: non-analysts get 403, no data leaks.
    // All queries are parameterized and scoped to req.user.orgId (story #12).

    // requireAnalyst runs as an inline guard (not a global route middleware) so
    // the ?mine and ?org branches above stay accessible to all roles.
    if (!req.user || !isAnalyst(req.user.role)) {
      return res.status(403).json({ error: "Analyst role required" });
    }
    if (!req.user.orgId) {
      // An analyst with no org shouldn't happen in prod; return gracefully rather
      // than crash with a Prisma error on orgId=null.
      return res.json({ stats: {}, recent: [] });
    }

    const orgId = req.user.orgId;

    // ── 1. Verdict breakdown ─────────────────────────────────────────────────
    // Count org submissions grouped by the aiScore verdict band (safe/review/dangerous).
    // We fetch in one query and bucket in JS (avoids a raw GROUP BY that Prisma can't
    // express without $queryRaw, keeping parameterization safe).
    const allOrgSubmissions = await prisma.submission.findMany({
      where: { orgId },
      select: { indicatorId: true, indicator: { select: { aiScore: true } } },
    });

    // Dedup to unique indicators (same URL reported multiple times = one verdict).
    const seenForStats = new Set();
    const uniqueIndicators = [];
    for (const s of allOrgSubmissions) {
      if (seenForStats.has(s.indicatorId)) continue;
      seenForStats.add(s.indicatorId);
      uniqueIndicators.push(s.indicator);
    }
    const verdictBreakdown = { safe: 0, review: 0, dangerous: 0, total: uniqueIndicators.length };
    for (const ind of uniqueIndicators) {
      const band = scoreBucket(ind.aiScore); // safe | review | dangerous
      verdictBreakdown[band] = (verdictBreakdown[band] ?? 0) + 1;
    }

    // ── 2. 7-day submission trend ─────────────────────────────────────────────
    // Count all org submissions per day for the past 7 days (incl. today).
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);

    const recentSubs = await prisma.submission.findMany({
      where: { orgId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Build a bucket per day (ISO date string) so zero-count days appear.
    const trendMap = new Map();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setUTCDate(d.getUTCDate() + i);
      trendMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const { createdAt } of recentSubs) {
      const key = new Date(createdAt).toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.set(key, trendMap.get(key) + 1);
    }
    const trend = [...trendMap.entries()].map(([date, count]) => ({ date, count }));

    // ── 3. Pending-review count ───────────────────────────────────────────────
    // How many of this org's indicators are still waiting on an analyst verdict?
    const pendingCount = await prisma.orgReview.count({
      where: { orgId, reviewStatus: "pending review" },
    });

    // ── 4. Recent activity feed (last 10 org submissions, newest first) ───────
    const recentActivity = await prisma.submission.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        indicator: { select: { aiTitle: true, domain: true, aiScore: true } },
        user: { select: { name: true } },
      },
    });
    const recent = recentActivity.map((s) => ({
      indicatorId: s.indicatorId,
      title: s.indicator.aiTitle ?? s.rawUrl,
      domain: s.indicator.domain,
      score: s.indicator.aiScore,
      kind: scoreBucket(s.indicator.aiScore),
      reporter: s.user?.name ?? null,
      createdAt: s.createdAt,
    }));

    return res.json({
      stats: {
        verdictBreakdown,  // { safe, review, dangerous, total }
        trend,             // [{ date: "YYYY-MM-DD", count: N }, ×7]
        pendingCount,      // number — indicators awaiting analyst review
      },
      recent,              // last 10 org submissions with title/score/reporter
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
