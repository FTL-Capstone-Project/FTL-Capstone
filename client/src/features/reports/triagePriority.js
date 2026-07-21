// ── feature: reports · analyst triage · owner: Ozias ──
// Pure ranking helpers for the analyst triage queue (card G1·05). No React here so
// they're trivial to unit-test. Given the report rows from GET /api/history?org=1&all=1,
// decide what an analyst should see at the TOP of the queue.

// Is this report still awaiting an analyst's authoritative call? Anything not yet
// CONFIRMED (safe or malicious) is "open" and should sort ahead of finished work.
// No review row at all = never looked at = also open (highest urgency).
export const isPending = (report) => {
  const status = report.review?.review_status;
  if (!status) return true; // no review yet
  return status === "pending review" || status === "investigating";
};

// Rank order for the triage queue:
//   1) OPEN items (pending / investigating / never-reviewed) before CONFIRMED ones,
//      so an analyst always sees outstanding work first.
//   2) Within the same open/closed group, more DANGEROUS first (lower safety score;
//      a missing score is treated as most urgent so it can't hide at the bottom).
//   3) Tie-break by RECENCY (newest report first).
// Returns a NEW sorted array (does not mutate the input).
export const sortByPriority = (reports) => {
  return [...reports].sort((a, b) => {
    // 1) open before confirmed
    const openA = isPending(a);
    const openB = isPending(b);
    if (openA !== openB) return openA ? -1 : 1;

    // 2) more dangerous (lower score) first; null score = most urgent (treat as -1)
    const scoreA = a.ai_score ?? -1;
    const scoreB = b.ai_score ?? -1;
    if (scoreA !== scoreB) return scoreA - scoreB;

    // 3) newest first
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });
};
