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
 *   - subject  → used ONLY for the standalone send. A threaded reply REUSES the thread's own subject,
 *                because Gmail only nests a message when its Subject matches the thread's (see below).
 *
 * WHY the threaded path builds raw MIME instead of GmailApp's thread.reply(): thread.reply()
 * re-encodes the inherited subject and mangles any astral-plane Unicode in it (the "fancy font"
 * letters scammers use, e.g. 𝘠𝘖𝘜 𝘞𝘖𝘕…) into "�". We assemble the message ourselves and RFC-2047
 * encode the subject so it survives — see sendThreadedReply_ below.
 *
 * DEPLOY:
 *   1. Set OUTBOUND_TOKEN below to the SAME value as the server's OUTBOUND_EMAIL_TOKEN env var.
 *   2. Enable the advanced Gmail service (needed for the raw-MIME threaded reply): in the editor,
 *      Services (+) → Gmail → Add. (This writes "Gmail" into the project's appsscript.json for you.)
 *   3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone.
 *   4. Copy the /exec URL into the server's OUTBOUND_EMAIL_URL env var.
 *   5. After ANY edit, redeploy: Deploy → Manage deployments → Edit → Version: New version → Deploy.
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
          sendThreadedReply_(thread, data.to, data.html);
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

/**
 * Reply into an existing Gmail thread WITHOUT the subject-mangling bug in GmailApp.thread.reply().
 * We build the raw RFC-2822 message ourselves and hand it to the advanced Gmail service, so we
 * control every header. Two things make this work:
 *   1. Subject is RFC-2047 encoded ("=?UTF-8?B?<base64>?="), so astral-plane Unicode (the "fancy
 *      font" glyphs scammers put in subjects) is carried as base64 and never turns into "�".
 *   2. We REUSE the thread's own subject + set References/In-Reply-To to the last message-id, because
 *      Gmail only nests a message under a thread when BOTH the Subject matches AND those headers
 *      point at the thread (per the Users.Messages "threadId" rules). A brand-new subject would
 *      silently start its own conversation instead of threading.
 */
function sendThreadedReply_(thread, to, html) {
  const messages = thread.getMessages();
  const last = messages[messages.length - 1]; // reply relative to the newest message in the thread
  const subject = thread.getFirstMessageSubject() || last.getSubject() || "";
  const messageId = last.getHeader("Message-ID") || last.getHeader("Message-Id") || "";

  // RFC-2047 "encoded-word" so non-ASCII survives the header intact (this is the actual "�" fix).
  const encodedSubject =
    "=?UTF-8?B?" + Utilities.base64Encode(subject, Utilities.Charset.UTF_8) + "?=";

  // CRLF line endings per RFC-2822; a blank line separates headers from the body.
  const headers = [
    "To: " + to,
    "Subject: " + encodedSubject,
    "In-Reply-To: " + messageId,
    "References: " + messageId,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  // Base64 the HTML body too, so any non-ASCII in the report body is likewise safe end-to-end.
  // Fold at 76 chars per RFC-2045 so strict MIME parsers accept it (base64Encode returns one line).
  const body = (Utilities.base64Encode(html, Utilities.Charset.UTF_8).match(/.{1,76}/g) || []).join("\r\n");
  const raw = headers.join("\r\n") + "\r\n\r\n" + body;

  // Gmail API wants the whole message web-safe-base64 encoded; threadId nests it in the thread.
  const rawEncoded = Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8);
  Gmail.Users.Messages.send({ raw: rawEncoded, threadId: thread.getId() }, "me");
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
