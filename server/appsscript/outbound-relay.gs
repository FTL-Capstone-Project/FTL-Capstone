/**
 * Orbis OUTBOUND report relay — Google Apps Script (paste into script.google.com on the
 * orbischecks@gmail.com account, deploy as a Web App). The Orbis server POSTs a finished report here
 * and this sends it to the user from Gmail. Server side: server/src/services/mailer.js.
 *
 * WHY this shape: free, mail goes out through REAL Gmail (Google's DKIM/SPF → lands in the inbox,
 * not spam), and it's HTTPS not SMTP (so Render's free-tier SMTP block can't stop it).
 *
 * PAYLOAD (JSON) — keep in sync with mailer.js's POST body:
 *   { token, to, subject, html, threadId }
 *   - token    → shared secret; must equal the server's OUTBOUND_EMAIL_TOKEN. Rejected otherwise.
 *   - threadId → OPTIONAL. When present, REPLY into that Gmail thread (so the report nests under the
 *                user's original forward); when absent/null, send a standalone email (old behavior).
 *
 * DEPLOY:
 *   1. Set OUTBOUND_TOKEN below to the SAME value as the server's OUTBOUND_EMAIL_TOKEN env var.
 *   2. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone.
 *   3. Copy the /exec URL into the server's OUTBOUND_EMAIL_URL env var.
 *   4. After ANY edit, redeploy: Deploy → Manage deployments → Edit → Version: New version → Deploy.
 *
 * NOTE: Apps Script always responds 200 with a redirect; the server treats any 2xx as success and
 * reads the {ok:...} JSON body after following the redirect.
 */

const OUTBOUND_TOKEN = "PASTE_OUTBOUND_EMAIL_TOKEN_HERE"; // ← must equal the server's OUTBOUND_EMAIL_TOKEN

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.token !== OUTBOUND_TOKEN) {
      return json_({ ok: false, error: "unauthorized" });
    }
    if (!data.to || !data.subject || !data.html) {
      return json_({ ok: false, error: "missing fields" });
    }

    // Thread the reply when we have a thread id AND that thread is still reachable; otherwise fall
    // back to a fresh standalone email so a stale/expired id never drops the report.
    let threaded = false;
    if (data.threadId) {
      try {
        const thread = GmailApp.getThreadById(data.threadId);
        if (thread) {
          thread.reply("", { htmlBody: data.html }); // "" = empty plain-text part; HTML is the body
          threaded = true;
        }
      } catch (err) {
        // fall through to standalone send
      }
    }
    if (!threaded) {
      GmailApp.sendEmail(data.to, data.subject, "", { htmlBody: data.html });
    }

    return json_({ ok: true, threaded: threaded });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
