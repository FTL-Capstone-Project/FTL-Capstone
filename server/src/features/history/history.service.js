// ── feature: history · service · owner: Ozias ──
// Pure helpers for the personal Reports page (no Express here → easy to test).
//
// The Reports UI (ReportCard.jsx) expects each report in this snake_case shape:
//   { indicator_id, url, title, description, tags[], reported_by, created_at,
//     kind, ai_score, screenshot_url, review }
// The DB stores camelCase columns and a NUMERIC aiScore only — so this file
// does the translation + derives the "kind" verdict word from the score.

// Map a 0-100 SAFETY score → the verdict word the card colors itself by.
// Thresholds match David's exported scoreBucket() in server/src/services/verdict.js
// exactly — he owns these numbers, we just mirror them here.
export function scoreToKind(aiScore) {
  if (aiScore == null) return "review"; // not scored yet → treat as needs-review
  if (aiScore >= 70) return "safe";
  if (aiScore >= 35) return "review";
  return "dangerous";
}

/**
 * Turn one Submission (with its joined indicator + optional orgReview) into the
 * report object the Reports page renders.
 *
 * @param {object} submission  Prisma Submission with `indicator` included
 * @param {object|null} orgReview  the caller-org's OrgReview for that indicator, or null
 * @param {string} reporterName  display name for "Reported by"
 */
export function toReportJson(submission, orgReview, reporterName) {
  const ind = submission.indicator;
  return {
    indicator_id: ind.id,
    url: submission.rawUrl,
    title: ind.aiTitle ?? null,           // persisted by David's scan pipeline
    description: ind.aiDescription ?? ind.aiVerdict ?? null,
    tags: Array.isArray(ind.aiTags) ? ind.aiTags : (ind.aiTags ?? []),
    reported_by: reporterName ?? "you",
    created_at: submission.createdAt,
    kind: scoreToKind(ind.aiScore),
    ai_score: ind.aiScore,
    screenshot_url: ind.screenshotUrl ?? null,
    // Org members see the analyst's closure status; individuals get null.
    review: orgReview
      ? {
          review_status: orgReview.reviewStatus,
          human_score: orgReview.humanScore,
          reviewed_by: orgReview.reviewedByUser?.name ?? null,
        }
      : null,
  };
}
