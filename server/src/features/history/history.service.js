// ── feature: history · service · owner: Ozias ──
// Pure helpers for the personal Reports page (no Express here → easy to test).
//
// The Reports UI (ReportCard.jsx) expects each report in this snake_case shape:
//   { indicator_id, url, title, description, tags[], reported_by, created_at,
//     kind, ai_score, screenshot_url, review }
// The DB stores camelCase columns and a NUMERIC aiScore only — so this file
// does the translation + derives the "kind" verdict word from the score.

// ── archive / delete a user's OWN reports (per-user, indicator-safe) · owner: David ──
// The Reports page shows one card per indicator, so both helpers act on ALL of the caller's
// submissions for that indicator at once. That keeps a card ATOMIC: because we flip every one
// of a user's rows for an indicator together, an indicator is never half-archived for them, so
// it shows in exactly one of the "active" / "archived" lists (the dedup can't split it).
//
// SCOPE (deliberate): the WHERE always pins `userId`, so we can only ever touch the caller's own
// Submission rows — never the GLOBAL Indicator (its shared score / verdict / reportCount) or
// another user's data. A caller passing an indicator they never submitted matches 0 rows, which
// the routes turn into a 404 — that doubles as the IDOR guard (no "does this exist?" leak).

// Soft-archive (archived=true) or restore (archived=false) the caller's submissions for one
// indicator. `now` is passed in (not read here) so the timestamp is the route's call, keeping
// this easy to unit-test. Returns the row count changed (0 = nothing of the caller's here).
export const setArchivedForUser = async (prisma, { userId, indicatorId, archived, now }) => {
  const { count } = await prisma.submission.updateMany({
    where: { userId, indicatorId },
    data: { archivedAt: archived ? now : null },
  });
  return count;
}

// Permanently delete the caller's submissions for one indicator. Same per-user guard. It does
// NOT touch the global Indicator (reportCount stays put) or ReportReason rows — removing my
// personal history is not the same as retracting a report I sent to the security team, so the
// shared threat-intel signal is left intact on purpose. Returns the row count deleted.
export const deleteForUser = async (prisma, { userId, indicatorId }) => {
  const { count } = await prisma.submission.deleteMany({
    where: { userId, indicatorId },
  });
  return count;
}

// Map a 0-100 SAFETY score → the verdict word the card colors itself by.
// Thresholds match David's exported scoreBucket() in server/src/services/verdict.js
// exactly — he owns these numbers, we just mirror them here.
export const scoreToKind = (aiScore) => {
  if (aiScore == null) return "review"; // not scored yet → treat as needs-review
  if (aiScore >= 70) return "safe";
  if (aiScore >= 35) return "review";
  return "dangerous";
}

// An analyst has spoken when they either scored it themselves or closed it with a confirmed status.
// "pending review" / "investigating" are work-in-progress, NOT a verdict — those must keep showing
// Orbo's assessment, or opening a triage ticket would blank out the only verdict the user has.
//
// Which verdict the card should wear: the analyst's when there is one, else Orbo's score.
// A confirmed-malicious close with no explicit score still reads "dangerous" (and confirmed-safe
// reads "safe"), because the status IS the verdict even when the analyst didn't type a number.
export const effectiveKind = (aiScore, orgReview) => {
  if (orgReview?.humanScore != null) return scoreToKind(orgReview.humanScore);
  if (orgReview?.reviewStatus === "confirmed malicious") return "dangerous";
  if (orgReview?.reviewStatus === "confirmed safe") return "safe";
  return scoreToKind(aiScore);
}

/**
 * Turn one Submission (with its joined indicator + optional orgReview) into the
 * report object the Reports page renders.
 *
 * @param {object} submission  Prisma Submission with `indicator` included
 * @param {object|null} orgReview  the caller-org's OrgReview for that indicator, or null
 * @param {string} reporterName  display name for "Reported by"
 */
export const toReportJson = (submission, orgReview, reporterName) => {
  const ind = submission.indicator;
  return {
    indicator_id: ind.id,
    url: submission.rawUrl,
    title: ind.aiTitle ?? null,           // persisted by David's scan pipeline
    description: ind.aiDescription ?? ind.aiVerdict ?? null,
    tags: Array.isArray(ind.aiTags) ? ind.aiTags : (ind.aiTags ?? []),
    reported_by: reporterName ?? "you",
    created_at: submission.createdAt,
    // THE ANALYST WINS. `kind` is what colors the card and picks its badge, so once a human analyst
    // has recorded an authoritative verdict it must come from THEM, not from Orbo's guess. Before
    // this, an analyst could mark something "confirmed malicious" with a score of 10 and the card
    // still showed a green "Looks safe" — the whole point of analyst review, invisible to the person
    // who reported it. Orbo's score is still returned as `ai_score` and shown as the secondary
    // number, so you can see both and how they differ.
    kind: effectiveKind(ind.aiScore, orgReview),
    ai_score: ind.aiScore,
    screenshot_url: ind.screenshotUrl ?? null,
    // How it was reported — "web" (the check form) or "email" (a forwarded email). Lets the card
    // show an "Email" badge and the modal label a forwarded-email report.
    source: submission.source ?? "web",
    // Org members see the analyst's closure status; individuals get null.
    review: orgReview
      ? {
          review_status: orgReview.reviewStatus,
          human_score: orgReview.humanScore,
          // The analyst's written notes. Needed so the review form PREFILLS with what's
          // already saved — without it the textarea opens blank and saving wipes the notes.
          human_verdict: orgReview.humanVerdict ?? null,
          reviewed_by: orgReview.reviewedByUser?.name ?? null,
          // When the verdict was recorded, so the card/modal can date it ("Priya S. · Jul 8").
          reviewed_at: orgReview.updatedAt ?? null,
          // Has an analyst shared this with the whole team? Team History only ever
          // returns shared items, but ?mine=1 can use this to hint "shared with your team".
          shared_with_org: orgReview.sharedWithOrg ?? false,
          // Which campaign this indicator is clustered into (or null). The analyst
          // triage queue groups rows by this to collapse duplicate/related reports (G1·06).
          campaign_id: orgReview.campaignId ?? null,
        }
      : null,
  };
}
