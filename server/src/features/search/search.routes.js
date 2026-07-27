// ── feature: search · owner: David ──
// GET /api/search?q=<term> — keyword search across the analyst's ORGANIZATION's threat history.
//
// The gap this fills: an analyst could only ever scroll the triage queue. There was no way to answer
// "have we seen this domain before?" — which is the first question you ask when a new report lands.
// Now they can search by URL, domain, or any word from the AI title/description.
//
// Guards, in order: requireAuth (verifies the session, sets req.user) → requireAnalyst (403 for
// everyone else). On top of that the service pins orgId, so even a valid analyst can only search
// their own org's reports — the role check and the data scope are separate, deliberately.
//
// Returns the SAME { reports: [...] } shape as GET /api/history?org=1, so the Reports page renders
// results with the existing ReportCard instead of a parallel "search result" component.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnalyst } from "../../middleware/requireAnalyst.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { prisma } from "../../db.js";
import { parseQuery, searchOrgHistory } from "./search.service.js";

export const searchRouter = Router();

// Each keystroke can fire a request if the client debounces loosely, and every search is a LIKE scan
// over the org's submissions — cheap per call, but worth a ceiling so a stuck input can't hammer the DB.
const searchLimit = rateLimit({ windowMs: 60_000, max: 60 });

searchRouter.get("/", requireAuth, requireAnalyst, searchLimit, async (req, res, next) => {
  const parsed = parseQuery(req.query.q);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const { reports, truncated } = await searchOrgHistory(prisma, {
      orgId: req.user.orgId ?? null,
      term: parsed.term,
    });
    // `query` echoes back the term the server actually searched (trimmed), so the UI can label the
    // results ("3 results for paypal") without re-deriving it. `truncated` tells the UI to show a
    // "narrow your search" hint rather than implying these are all the matches.
    return res.json({ reports, query: parsed.term, truncated });
  } catch (err) {
    // Log server-side, return nothing internal (team code style: never leak Prisma errors).
    return next(err);
  }
});
