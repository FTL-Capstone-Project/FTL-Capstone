// ── feature: submissions · escalation helper · owner: Ozias ──
// escalateSubmission() is the O9 seam between David's submission flow and my
// closure loop. When an org-member submits a link, David's POST /api/submissions
// calls this to:
//   1. Mark the submission as escalated (escalated: true on the Submission row).
//   2. Upsert an OrgReview row so the analyst sees it in their queue.
//
// It takes the Prisma client as its first argument (same pattern as users.service.js)
// so it's easy to unit-test without a live DB, and easy for David to wire in once
// his route migrates from the dev-only _devStore.js to real Prisma (Step 2).
//
// Arguments:
//   prisma      — the shared PrismaClient instance from db.js
//   submissionId — the Submission.id to escalate
//   orgId        — the org this review belongs to (from req.user.orgId)
//   indicatorId  — the global Indicator this submission is about
//
// Returns: { submission, orgReview } — the updated rows, for the route to log/return.

export async function escalateSubmission(prisma, { submissionId, orgId, indicatorId }) {
  if (!submissionId) throw new Error("escalateSubmission: submissionId is required");
  if (!orgId) throw new Error("escalateSubmission: orgId is required (only org members can escalate)");
  if (!indicatorId) throw new Error("escalateSubmission: indicatorId is required");

  // Mark the submission row as escalated. This lets the Reports query filter/flag it.
  const submission = await prisma.submission.update({
    where: { id: submissionId },
    data: { escalated: true },
  });

  // Upsert the org's review row. @@unique([orgId, indicatorId]) means if the analyst
  // already reviewed this URL for this org, we leave their verdict alone (no update).
  // If it's new, create it with the default "pending review" status.
  const orgReview = await prisma.orgReview.upsert({
    where: { orgId_indicatorId: { orgId, indicatorId } },
    update: {}, // analyst has already touched this — don't reset their work
    create: { orgId, indicatorId, reviewStatus: "pending review" },
  });

  return { submission, orgReview };
}
