// ── feature: search · service · owner: David ──
// Keyword search across an org's threat history. Pure query-building + shaping, no Express here,
// so the matching rules are unit-testable without a DB.
//
// WHY a service: the WHERE clause is the security boundary. It ALWAYS pins orgId, so an analyst can
// only ever search their own organization's reports (story #12 data isolation). Keeping it in one
// tested function means that guarantee can't be accidentally dropped by a future route edit.
import { toReportJson } from "../history/history.service.js";

// Search term limits. A 1-character query would match nearly every row (and scan the whole table for
// no useful result), so we require 2. The upper bound just stops a giant string being sent to Postgres.
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 200;
// Cap the rows we return. An analyst scanning results doesn't page past this, and it bounds the
// response size + query cost on a big org. Deliberately generous — the UI shows a "narrow your
// search" hint when it hits the cap rather than pretending the list is complete.
export const MAX_RESULTS = 100;

/**
 * Normalize + validate a raw ?q= value.
 * @returns {{ ok: true, term: string } | { ok: false, error: string }}
 */
export const parseQuery = (raw) => {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Provide a search term (?q=)." };
  }
  const term = raw.trim();
  if (term.length < MIN_QUERY_LENGTH) {
    return { ok: false, error: `Search for at least ${MIN_QUERY_LENGTH} characters.` };
  }
  if (term.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: `Keep your search under ${MAX_QUERY_LENGTH} characters.` };
  }
  return { ok: true, term };
};

// The fields a keyword can match. rawUrl lives on the Submission (what the user actually pasted);
// the rest live on the joined global Indicator. `contains` + insensitive mode = a case-insensitive
// substring match, so "paypal" finds "PayPal login" and "secure-paypal.com" alike.
//
// Prisma builds this as a PARAMETERIZED query — the term is never concatenated into SQL, so a term
// like "%' OR 1=1 --" is treated as literal text to search for, not syntax.
export const buildSearchWhere = (orgId, term) => ({
  orgId,
  OR: [
    { rawUrl: { contains: term, mode: "insensitive" } },
    { indicator: { domain: { contains: term, mode: "insensitive" } } },
    { indicator: { aiTitle: { contains: term, mode: "insensitive" } } },
    { indicator: { aiDescription: { contains: term, mode: "insensitive" } } },
  ],
});

/**
 * Search one org's threat history by keyword.
 *
 * Returns the SAME { reports: [...] } shape as GET /api/history?org=1 so the Reports page can
 * render results with the existing ReportCard — a search result IS a report card, just filtered.
 *
 * @param {object} prisma  Prisma client (injected so tests can pass a mock)
 * @param {{ orgId: number|null, term: string }} args
 * @returns {Promise<{ reports: object[], truncated: boolean }>}
 */
export const searchOrgHistory = async (prisma, { orgId, term }) => {
  // No org = no org history to search. Return empty rather than an error: an individual hitting
  // this has nothing to find, which isn't a failure. (The route's requireAnalyst means this is rare.)
  if (orgId == null) return { reports: [], truncated: false };

  // 1) Matching submissions in MY org, newest first, with the global indicator + the teammate who
  //    reported it (for "Reported by <name>"). take = MAX_RESULTS + 1 so we can tell whether there
  //    were MORE matches than we're returning, without a second count query.
  const submissions = await prisma.submission.findMany({
    where: buildSearchWhere(orgId, term),
    orderBy: { createdAt: "desc" },
    include: { indicator: true, user: true },
    take: MAX_RESULTS + 1,
  });

  const truncated = submissions.length > MAX_RESULTS;
  const rows = truncated ? submissions.slice(0, MAX_RESULTS) : submissions;

  // 2) This org's reviews for the matched indicators, in ONE query (avoids N+1). We fetch ALL
  //    statuses — not just sharedWithOrg — because only analysts reach this route, and they need to
  //    find in-progress/unshared items too (same reasoning as history's analyst triage mode).
  const indicatorIds = rows.map((s) => s.indicatorId);
  const reviews = indicatorIds.length
    ? await prisma.orgReview.findMany({
        where: { orgId, indicatorId: { in: indicatorIds } },
        include: { reviewedByUser: true },
      })
    : [];
  const reviewsByIndicator = new Map(reviews.map((r) => [r.indicatorId, r]));

  // 3) One card per unique indicator — if two teammates reported the same URL, it's one result.
  //    Rows are already newest-first, so the first occurrence we keep is the most recent.
  const seen = new Set();
  const reports = [];
  for (const submission of rows) {
    if (seen.has(submission.indicatorId)) continue;
    seen.add(submission.indicatorId);
    const review = reviewsByIndicator.get(submission.indicatorId) ?? null;
    reports.push(toReportJson(submission, review, submission.user?.name));
  }

  return { reports, truncated };
};
