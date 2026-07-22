// ── feature: report email · owner: Ozias ──
// Pure function: a report object (the SAME shape readIndicatorForClient returns) → an email-safe
// HTML string. It mirrors the in-app ReportDetailModal — verdict badge, safety score /100, the
// safety-analysis text, and the severity-colored "threat vectors" (including the per-link breakdown
// rows Feature 1 produces for a multi-link email), plus the sandbox screenshot when we have one.
//
// Email HTML is NOT web HTML: clients (Gmail/Outlook) strip <style> blocks, CSS variables, and
// flexbox. So everything here is INLINE styles + <table> layout + hard-coded hex (copied from the
// light theme in client/src/theme/tokens.css). No imports, no CSS vars — that's deliberate.

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
const LABEL = { safe: "Looks safe", review: "Worth a closer look", dangerous: "Likely dangerous" };

// Escape user/model text before dropping it into HTML (a phishing subject could contain markup).
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// One severity-colored "threat vector" row (label + a qualitative bar), matching the modal.
const threatRow = ({ text, severity }) => {
  const c = COLORS[severity] ?? COLORS.review;
  const fill = severity === "dangerous" ? 92 : severity === "safe" ? 28 : 58;
  return `
    <tr><td style="padding:6px 0;">
      <div style="font-size:14px;color:${COLORS.text};margin-bottom:5px;">${esc(text)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.border};border-radius:999px;">
        <tr><td style="background:${c.fg};height:8px;width:${fill}%;border-radius:999px;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
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

  const evidenceRows = evidence.length
    ? evidence.map(threatRow).join("")
    : threatRow({ text: "We reviewed the sender and message content.", severity: "review" });

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

        <!-- Threat vectors (includes the per-link breakdown for multi-link emails) -->
        <tr><td style="padding:22px 28px 4px;">
          <h2 style="margin:0 0 6px;font-size:16px;color:${COLORS.navy};">Threat vectors</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${evidenceRows}</table>
        </td></tr>

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
