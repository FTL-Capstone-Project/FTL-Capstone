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
import { toReportJson } from "./history.service.js";

export const historyRouter = Router();

historyRouter.get("/", requireAuth, async (req, res, next) => {
  const mine = req.query.mine === "1";
  const orgWide = req.query.org === "1";

  try {
    if (mine) {
      // 1) All of my submissions, newest first, with the joined GLOBAL indicator
      //    (score / verdict / status / screenshot live on the indicator).
      const submissions = await prisma.submission.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        include: { indicator: true },
      });

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

    // Org-wide STATS (analyst dashboard) branch → analyst track; guard with
    // requireAnalyst. TODO(analyst): stats + recent for req.user.orgId.
    return res.json({ recent: [], stats: {} });
  } catch (err) {
    return next(err);
  }
});
