// ── feature: report email · owner: Ozias ──
// Pure function: a report object (the SAME shape readIndicatorForClient returns) → an email-safe
// HTML string. It mirrors the in-app ReportDetailModal — verdict badge, safety score /100, the
// safety-analysis text, the "Why this score" panel (including the per-link breakdown rows Feature 1
// produces for a multi-link email) and the "What to do" steps, plus the sandbox screenshot.
//
// Email HTML is NOT web HTML: clients (Gmail/Outlook) strip <style> blocks, CSS variables, and
// flexbox. So everything here is INLINE styles + <table> layout + hard-coded hex (copied from the
// light theme in client/src/theme/tokens.css). No imports, no CSS vars — that's deliberate.
//
// TWO deliberate differences from the in-app panel, both forced by email clients:
//   1. NO collapse. Gmail strips <details>, and there's no JS, so both groups render EXPANDED.
//      Same content, same order — just no interaction.
//   2. The severity dot is a tiny <table> cell, not a styled <span>, because border-radius on an
//      inline element is unreliable in Outlook.

// Verdict colors, hard-coded from tokens.css (email can't read our CSS variables).
const COLORS = {
  safe:      { fg: "#198038", bg: "#E6F4EA" },
  review:    { fg: "#B9860B", bg: "#FCF3D6" },
  dangerous: { fg: "#DA1E28", bg: "#FBE7E8" },
  navy: "#0A2540",
  text: "#1A2230",
  textDim: "#556070",
  border: "#E2E8F0",
  canvas: "#F4F6F8",
  surface: "#FFFFFF",
  primary: "#0F62FE",
};

// 0-100 SAFETY score → bucket, mirroring verdict.js scoreBucket (100 = safe).
const bucketOf = (score) => (score == null ? "review" : score >= 70 ? "safe" : score >= 35 ? "review" : "dangerous");
// ONE verdict vocabulary across every surface. These are the same three words the in-app badge uses
// (client/src/config/constants.js VERDICT_STYLES) — the email used to say "Worth a closer look"
// where the app said "Suspicious" and the Reports filter said a third thing, so a user who filtered
// by one word opened a report labelled another.
const LABEL = { safe: "Safe", review: "Suspicious", dangerous: "Dangerous" };

// Escape user/model text before dropping it into HTML (a phishing subject could contain markup).
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// One evidence row: severity dot + the sentence + (only when we know it) what that signal cost.
//
// The old version of this row drew a bar whose width was one of three constants (92% / 58% / 28%),
// so it LOOKED measured while carrying nothing the color didn't already say. Now the honest number
// is printed when we have it and omitted when we don't — we never invent a cost for a sentence.
const evidenceRow = ({ text, severity, weight }) => {
  const c = COLORS[severity] ?? COLORS.review;
  // Never a cost on a reassurance row — see the note in the client's WhyThisScore.jsx: a safe-band
  // score clamps every row to "safe", and "−6 pts" under "What checked out" contradicts the heading.
  const showCost = typeof weight === "number" && weight > 0 && severity !== "safe";
  return `
    <tr><td style="padding:5px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="18" valign="top" style="padding-top:6px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="8" height="8" style="background:${c.fg};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>
            </tr></table>
          </td>
          <td valign="top" style="font-size:14px;line-height:1.5;color:${COLORS.text};">${esc(text)}</td>
          ${showCost ? `<td width="66" valign="top" align="right" style="font-size:12px;font-weight:700;color:${COLORS.textDim};white-space:nowrap;">&minus;${weight} pts</td>` : ""}
        </tr>
      </table>
    </td></tr>`;
};

// A labeled group of rows. The heading is the SECONDARY encoding that makes the panel readable
// without color: our amber and green are close enough (ΔE ~7.7 for a red/green-colorblind reader)
// that "which of these is a problem?" can't rest on hue alone — and an email can't even be sure the
// colors survive dark-mode mangling by the client.
const evidenceGroup = ({ heading, rows }) => {
  if (!rows.length) return "";
  return `
        <tr><td style="padding:16px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${COLORS.textDim};margin-bottom:6px;">${heading} (${rows.length})</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(evidenceRow).join("")}</table>
        </td></tr>`;
};

// "What to do" — the same server-computed strings the in-app panel renders (services/nextSteps.js),
// so the email and the app can never give different advice. An <ol> is safe in every mail client.
const nextStepsBlock = (steps) => {
  if (!steps.length) return "";
  return `
        <tr><td style="padding:18px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${COLORS.textDim};margin-bottom:6px;">What to do</div>
          <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:${COLORS.text};">
            ${steps.map((step) => `<li style="margin-bottom:4px;">${esc(step)}</li>`).join("")}
          </ol>
        </td></tr>`;
};

// report → HTML string. appUrl (the client) powers the "View full report" button.
export const buildReportEmailHtml = ({ report, appUrl = "" }) => {
  const score = report?.ai_score ?? null;
  const kind = bucketOf(score);
  const c = COLORS[kind];
  const title = report?.title || "Your Orbis check";
  const analysis = report?.ai_verdict || report?.description || "";
  const evidence = Array.isArray(report?.evidence) ? report.evidence : [];
  const screenshot = report?.screenshot_url || null;
  const steps = Array.isArray(report?.next_steps) ? report.next_steps.filter(Boolean) : [];

  // Split the one flat list the way the in-app panel does: what went WRONG vs what we checked that
  // was FINE. Rows arrive already deduped, severity-clamped and ranked worst-first from the server
  // (reconcileEvidence / buildReasons), so we only group them — we never re-sort.
  const rows = evidence.filter((row) => row?.text);
  const concerns = rows.filter((row) => row.severity !== "safe");
  const checks = rows.filter((row) => row.severity === "safe");
  // A report with no rows at all still needs one honest line, so the panel is never an empty box.
  const panel = rows.length
    ? evidenceGroup({ heading: "What raised concern", rows: concerns }) +
      evidenceGroup({ heading: "What checked out", rows: checks })
    : evidenceGroup({ heading: "What checked out", rows: [{ text: "We reviewed the sender and message content.", severity: "review" }] });

  const scoreText = score == null ? "&mdash;" : String(score);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${COLORS.canvas};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">

        <!-- Header -->
        <tr><td style="padding:24px 28px 8px;">
          <div style="font-size:13px;color:${COLORS.textDim};letter-spacing:.4px;text-transform:uppercase;">Orbis report</div>
          <h1 style="margin:8px 0 0;font-size:22px;color:${COLORS.navy};">${esc(title)}</h1>
          <span style="display:inline-block;margin-top:12px;padding:5px 12px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:13px;font-weight:700;">${LABEL[kind]}</span>
        </td></tr>

        ${screenshot ? `
        <!-- Screenshot (submitters only; readIndicatorForClient already applied the IDOR guard) -->
        <tr><td style="padding:16px 28px 0;">
          <img src="${esc(screenshot)}" alt="Sandbox preview of where a link in this email leads" width="544" style="display:block;width:100%;max-width:544px;border:1px solid ${COLORS.border};border-radius:12px;" />
        </td></tr>` : ""}

        <!-- Safety score -->
        <tr><td style="padding:20px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas};border:1px solid ${COLORS.border};border-radius:12px;">
            <tr><td align="center" style="padding:16px;">
              <div style="font-size:13px;color:${COLORS.textDim};">Orbo score</div>
              <div style="margin:4px 0;"><span style="font-size:40px;font-weight:800;color:${c.fg};">${scoreText}</span><span style="font-size:16px;color:${COLORS.textDim};">/100</span></div>
              <div style="font-size:12px;color:${COLORS.textDim};">Scored by Orbo (AI)</div>
            </td></tr>
          </table>
        </td></tr>

        ${analysis ? `
        <!-- Safety analysis -->
        <tr><td style="padding:22px 28px 0;">
          <h2 style="margin:0 0 8px;font-size:16px;color:${COLORS.navy};">Safety analysis</h2>
          <p style="margin:0;font-size:14px;line-height:1.6;color:${COLORS.textDim};">${esc(analysis)}</p>
        </td></tr>` : ""}

        <!-- Why this score: concerns, then reassurances, then what to do. Both groups are always
             EXPANDED here (see the header note on collapse). Includes the per-link breakdown. -->
        <tr><td style="padding:22px 28px 0;">
          <h2 style="margin:0;font-size:16px;color:${COLORS.navy};">Why this score</h2>
        </td></tr>
        ${panel}
        ${nextStepsBlock(steps)}

        ${appUrl ? `
        <!-- CTA -->
        <tr><td style="padding:20px 28px 28px;">
          <a href="${esc(appUrl)}" style="display:inline-block;padding:11px 22px;background:${COLORS.primary};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">View full report in Orbis</a>
        </td></tr>` : ""}

        <!-- Footer -->
        <tr><td style="padding:16px 28px 24px;border-top:1px solid ${COLORS.border};">
          <p style="margin:0;font-size:12px;color:${COLORS.textDim};line-height:1.5;">You received this because you forwarded an email to Orbis for a safety check. When in doubt, don't click links or share personal info &mdash; verify with the sender through a channel you trust.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
};
