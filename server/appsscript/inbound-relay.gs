/**
 * Orbis INBOUND email relay — Google Apps Script (paste into script.google.com on the
 * orbischecks@gmail.com account). Runs on a ~1-minute time trigger, finds newly-forwarded emails,
 * and POSTs each to the Orbis API's POST /api/webhooks/inbound-email endpoint.
 *
 * WHY this exists: Orbis runs no mail infrastructure. A free Gmail inbox + this script are the whole
 * "mail server." The server side that consumes this payload is:
 *   server/src/features/webhooks/webhooks.routes.js  (the route)
 *   server/src/features/webhooks/inboundEmail.js     (the parsers)
 *
 * PAYLOAD (JSON) — keep these keys in sync with the route's destructure:
 *   { from, to, subject, body, html, headers, replyTo, threadId }
 * The last four are the RICHER fields that unlock Orbis's strongest checks:
 *   - html     → real "link_mismatch" (anchor visible-text host vs href host)
 *   - headers  → SPF/DKIM/DMARC results (a DKIM/DMARC fail = forged sender)
 *   - replyTo  → Reply-To domain vs From domain mismatch
 *   - threadId → lets the report email REPLY into this same thread (see outbound-relay.gs)
 * All four are OPTIONAL on the server: a plain-text relay that omits them still works.
 *
 * SETUP:
 *   1. Set ORBIS_API_URL to your deployed API (e.g. https://orbis-api.onrender.com).
 *   2. Set ORBIS_TOKEN to the SAME value as the server's INBOUND_EMAIL_TOKEN env var.
 *   3. Add a time-driven trigger: Triggers → Add Trigger → relayForwards → Time-driven → Minutes → Every minute.
 *   4. Forward suspicious emails into this inbox; label/handling below marks them processed so they
 *      aren't sent twice.
 */

const ORBIS_API_URL = "https://orbis-api.onrender.com"; // ← your deployed API base URL
const ORBIS_TOKEN = "PASTE_INBOUND_EMAIL_TOKEN_HERE";   // ← must equal the server's INBOUND_EMAIL_TOKEN
const PROCESSED_LABEL = "orbis-sent";                    // threads we've already relayed get this label

function relayForwards() {
  const label = getOrCreateLabel_(PROCESSED_LABEL);
  // Unprocessed inbox threads only. Cap the batch so a backlog can't time out one run.
  const threads = GmailApp.search("in:inbox -label:" + PROCESSED_LABEL, 0, 10);

  for (const thread of threads) {
    try {
      const msg = thread.getMessages()[0]; // the forwarded message is the first in its thread
      const payload = {
        from: msg.getFrom(),
        to: msg.getTo(),
        subject: msg.getSubject(),
        body: msg.getPlainBody(),        // plain-text body (always present)
        html: msg.getBody(),             // HTML body → anchor-vs-href link_mismatch
        headers: rawHeaderBlock_(msg),   // top header block → SPF/DKIM/DMARC
        replyTo: msg.getReplyTo(),       // Reply-To (may be "") → reply-to mismatch
        threadId: thread.getId(),        // so the report replies into this thread
      };

      const res = UrlFetchApp.fetch(ORBIS_API_URL + "/api/webhooks/inbound-email", {
        method: "post",
        contentType: "application/json",
        headers: { "x-orbis-token": ORBIS_TOKEN },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true, // don't throw on non-2xx; we just log + still mark processed
      });

      Logger.log("Orbis relay: %s → %s", msg.getSubject(), res.getResponseCode());
    } catch (err) {
      Logger.log("Orbis relay error: " + err);
    }
    // Mark processed either way, so a poison message can't loop forever.
    thread.addLabel(label);
  }
}

/**
 * The raw header block only (everything before the first blank line). getRawContent() returns the
 * FULL RFC822 message (headers + body); we keep just the headers so the payload stays small — the
 * server slices it further and only reads SPF/DKIM/DMARC out of it.
 */
function rawHeaderBlock_(msg) {
  const raw = msg.getRawContent();
  const split = raw.indexOf("\r\n\r\n");
  const headerEnd = split >= 0 ? split : raw.indexOf("\n\n");
  return headerEnd >= 0 ? raw.substring(0, headerEnd) : raw.substring(0, 50000);
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
