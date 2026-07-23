// ── feature: report email · owner: Ozias ──
// Glue that emails a user their finished report — a SIBLING channel to the in-app notification, not
// a replacement. It reuses the SAME data the app's GET /api/indicators/:id returns
// (readIndicatorForClient), so the email shows exactly what the app shows AND inherits its IDOR
// guard (the screenshot/landing URL are only included for indicators the recipient actually
// submitted). Best-effort: returns false and NEVER throws, so a mail problem can't break the
// analysis pipeline that calls it.
import { prisma } from "../../db.js";
import { readIndicatorForClient } from "../indicators/indicators.service.js";
import { buildReportEmailHtml } from "./reportEmailTemplate.js";
import { sendMail } from "../../services/mailer.js";
import { env } from "../../config/env.js";

// @param {{ user: { id, email, orgId, emailReports? }, indicatorId, subject?, threadId? }}
// threadId (optional): the Gmail thread of the user's original forward → the report REPLIES into it.
// When the caller doesn't have it (e.g. re-forward path), we fall back to the thread id stored on the
// user's most recent email Submission for this indicator, so re-forwards still thread.
export const sendReportEmail = async ({ user, indicatorId, subject, threadId = null }) => {
  try {
    if (!user?.email) return false;                       // no deliverable address on record
    if (String(user.email).endsWith("@placeholder.orbis")) return false; // Clerk gave us no real email

    // Respect the per-user opt-out. The caller may not carry the flag, so look it up when it's not
    // already present (a single indexed point read). Defaults to opted-in for older rows.
    let optedIn = user.emailReports;
    if (optedIn == null && user.id != null) {
      const row = await prisma.user.findUnique({ where: { id: user.id }, select: { emailReports: true } });
      optedIn = row?.emailReports ?? true;
    }
    if (optedIn === false) return false;

    // Assemble the report exactly as the API would for THIS user (so the IDOR guard applies).
    const report = await readIndicatorForClient(indicatorId, user);
    if (!report || report.status !== "done") return false; // don't email a pending/errored check

    // Recover the thread id if the caller didn't pass one (re-forward resend): use the most recent
    // email submission this user made for this indicator. Best-effort — a miss just sends standalone.
    let thread = threadId;
    if (!thread && user.id != null) {
      const sub = await prisma.submission.findFirst({
        where: { indicatorId, userId: user.id, source: "email", emailThreadId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { emailThreadId: true },
      });
      thread = sub?.emailThreadId ?? null;
    }

    const html = buildReportEmailHtml({ report, appUrl: env.clientUrl });
    return await sendMail({
      to: user.email,
      subject: subject || `Orbis report: ${report.title ?? "your check"}`,
      html,
      threadId: thread,
    });
  } catch (e) {
    console.warn("⚠ sendReportEmail failed (non-fatal):", e.message);
    return false;
  }
};
