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
 * We watch INBOX **and SPAM** — a forwarded scam is often auto-filed as spam, and `in:inbox` alone
 * would never see it. Each processed thread is labeled (so it won't loop), marked READ (so forwards
 * don't keep the unread look), and pulled into the inbox (so every forward is consistently visible).
 * We deliberately do NOT watch Trash or Sent — you'd never auto-relay deleted mail or our own report
 * replies. Category tabs (Promotions/Social/Updates) are already inside `in:inbox`.
 *
 * SETUP:
 *   1. Set ORBIS_API_URL to your deployed API BASE URL (e.g. https://orbis-api.onrender.com) — the
 *      fetch appends the "/api/webhooks/inbound-email" path, so do NOT include it here.
 *   2. Set ORBIS_TOKEN to the SAME value as the server's INBOUND_EMAIL_TOKEN env var.
 *   3. Run baselineExistingInbox() ONCE (labels the current inbox+spam backlog WITHOUT sending, so
 *      you don't get a flood of reports for mail that was already sitting there).
 *   4. Add a time-driven trigger: Triggers → Add Trigger → relayForwards → Time-driven → Minutes → Every minute.
 */

const ORBIS_API_URL = "https://orbis-api.onrender.com"; // ← your deployed API BASE URL (no path)
const ORBIS_TOKEN = "PASTE_INBOUND_EMAIL_TOKEN_HERE";   // ← must equal the server's INBOUND_EMAIL_TOKEN
const PROCESSED_LABEL = "orbis-sent";                   // threads we've already relayed get this label

// Work to do: unprocessed threads in INBOX or SPAM. Parentheses group the location filters so the
// -label exclusion applies to both. Shared by relayForwards + baselineExistingInbox so they can't drift.
const RELAY_QUERY = "(in:inbox OR in:spam) -label:" + PROCESSED_LABEL;

function relayForwards() {
  const label = getOrCreateLabel_(PROCESSED_LABEL);
  // Cap the batch so a backlog can't time out one run.
  const threads = GmailApp.search(RELAY_QUERY, 0, 10);

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
    // Housekeeping (always runs, even on error, so a poison message can't loop forever):
    //   • label → excluded from RELAY_QUERY next time (never re-sent)
    //   • read  → so forwards don't keep the unread look
    //   • inbox → pull out of spam so every forward is consistently visible
    thread.addLabel(label);
    thread.markRead();
    thread.moveToInbox();
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

/**
 * Run ONCE, manually, before enabling the trigger. Labels all CURRENT inbox + spam mail as processed
 * (and marks it read) WITHOUT relaying it — so only emails that arrive AFTER now ever get sent to
 * Orbis. Without this, the first run would relay the entire existing backlog and email a report for
 * every one.
 */
function baselineExistingInbox() {
  const label = getOrCreateLabel_(PROCESSED_LABEL);
  let n = 0;
  while (true) {
    const threads = GmailApp.search(RELAY_QUERY, 0, 100);
    if (threads.length === 0) break;
    threads.forEach((t) => { t.addLabel(label); t.markRead(); });
    n += threads.length;
    if (threads.length < 100) break;
  }
  Logger.log("Baselined %s existing threads.", n);
}
