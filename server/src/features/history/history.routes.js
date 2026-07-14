// ── feature: history · owner: Ozias (personal ?mine=1) / analyst track (org-wide) ──
// GET /api/history?mine=1 — the caller's own reports (personal Reports page). §6.
//
// This is the data source for my Reports screen. Flow:
//   Reports.jsx → api.get("/api/history?mine=1") → HERE → Prisma → Postgres → back.
// requireAuth (Michael's middleware) puts the verified user on req.user, so we
// only ever return THAT user's submissions (story #12 data isolation).
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db.js";
import { toReportJson } from "./history.service.js";

export const historyRouter = Router();

historyRouter.get("/", requireAuth, async (req, res, next) => {
  const mine = req.query.mine === "1";

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

    // Org-wide (analyst) branch → analyst track; guard with requireAnalyst.
    // TODO(analyst): stats + recent for req.user.orgId.
    return res.json({ recent: [], stats: {} });
  } catch (err) {
    return next(err);
  }
});
