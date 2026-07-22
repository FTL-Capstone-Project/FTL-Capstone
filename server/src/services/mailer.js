// ── feature: outbound email · owner: Ozias ──
// Outbound email transport. The server POSTs report JSON to OUR OWN Google Apps Script Web App
// (script.google.com), which sends the mail via GmailApp from orbischecks@gmail.com — the SAME
// Gmail + Apps Script relay the inbound path uses, just in reverse. Why this shape:
//   - Free (a normal Gmail account), and mail goes out through REAL Gmail, so Google's DKIM/SPF
//     land it in the inbox instead of spam — no paid custom domain needed.
//   - HTTPS, not SMTP: Render's free tier blocks outbound SMTP ports, but a plain fetch() to an
//     https:// URL is fine. Swapping to a provider (SendGrid/Resend) later = change ONLY this file.
//
// SECURITY: the POST target is env.outboundEmail.url — OUR configured script.google.com URL, NEVER a
// user-supplied one, so there's no SSRF surface (see .claude/rules/code-style.md). The recipient
// address is user data but travels in the JSON BODY, not the URL.
//
// Best-effort by design: returns false on any problem and NEVER throws, so a mail failure can't
// break the analysis pipeline that calls it.
import { env } from "../config/env.js";

export const sendMail = async ({ to, subject, html }) => {
  const { url, token } = env.outboundEmail;
  if (!url || !token) return false;          // not configured → silent no-op (feature is off)
  if (!to || !subject || !html) return false; // nothing to send

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // token in the BODY (a query string would leak the secret into Google's access logs).
      body: JSON.stringify({ token, to, subject, html }),
    });
    if (!res.ok) {
      console.warn(`⚠ sendMail: relay responded ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("⚠ sendMail failed (non-fatal):", e.message);
    return false;
  }
};
