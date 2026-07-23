// ── feature: webhooks (inbound-email) · owner: Ozias ──
// Pure text extractors for the inbound-email handler. No Express, no DB — just
// string → string, so they're trivial to unit-test. The handler in
// webhooks.routes.js composes these to turn a forwarded email into submitUrl() args.

// Pull the bare address out of a From/To header value and lowercase it.
//   "David M. <david@acme.com>" → "david@acme.com"
//   "sofia@example.com"          → "sofia@example.com"
// Returns null if there's no email-looking token at all.
export const extractEmailAddress = (headerValue) => {
  if (typeof headerValue !== "string") return null;
  // Prefer the address inside angle brackets ("Name <addr>"), else the whole string.
  const angled = headerValue.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : headerValue).trim().toLowerCase();
  // Basic shape check: something@something.tld — good enough to reject non-emails.
  const match = candidate.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);
  return match ? match[0] : null;
}

// Pull the ORIGINAL sender out of a forwarded email body. When someone forwards a scam, the
// envelope `from` is the FORWARDER (e.g. the user's own Gmail) — the real suspect sits inside the
// quoted forward header. We parse that so the sender-trust analysis judges the scammer, not the
// forwarder. Handles the common client formats (Gmail / Apple Mail / Outlook), takes the FIRST
// (topmost = original) "From:" line, and returns a lowercased address or null.
//   "---------- Forwarded message ----------\nFrom: Scam <no-reply@evil.com>\n..." → "no-reply@evil.com"
export const extractOriginalSender = (body) => {
  if (typeof body !== "string" || !body.trim()) return null;
  // Match the FIRST "From:" line (case-insensitive, at a line start after optional quote markers
  // like "> " that some clients add). Capture the rest of that line and pull the address out of it
  // with the same extractor the envelope uses — so "Name <addr>", bare addr, and lists all work.
  const m = body.match(/^[>\s]*from:\s*(.+)$/im);
  if (!m) return null;
  return extractEmailAddress(m[1]);
}

// Pull the plus-addressing token out of a recipient address.
//   "orbischecks+david@gmail.com" → "david"
// Returns null when there's no "+token" segment. Lowercased to match the env map.
export const extractPlusToken = (toValue) => {
  const email = extractEmailAddress(toValue);
  if (!email) return null;
  const plus = email.match(/\+([^@]+)@/);
  return plus ? plus[1] : null;
}

// Find the first http(s) URL in a blob of text (subject + body). Returns null if none.
// Trailing sentence punctuation is trimmed so "visit https://x.com." doesn't keep the dot.
// Kept for back-compat (the route still passes rawUrl = the first link); extractAllUrls below
// is the one that finds EVERY link so we can scan them all.
export const extractFirstUrl = (text) => {
  if (typeof text !== "string") return null;
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;:!?]+$/, "");
}

// Find EVERY link in a blob of text, in order. A phishing email often buries the malicious link
// among safe ones (an unsubscribe link, a real logo link) — so scanning only the first (what the
// old extractFirstUrl did) can miss the dangerous one entirely. We catch two shapes:
//   1. full http(s):// links, and
//   2. bare "www."-prefixed links (no scheme) — common in email text — and prepend https:// so the
//      scanner can actually open them.
// We deliberately do NOT try to grab fully bare domains like "acme.com": in prose that produces
// constant false positives (filenames, "e.g.", version numbers). Trailing sentence punctuation is
// trimmed like extractFirstUrl. This is pure string → string[]; the route owns normalize + dedup
// (it already imports normalizeUrl), so this module stays dependency-free and trivially testable.
export const extractAllUrls = (text) => {
  if (typeof text !== "string") return [];
  const trim = (u) => u.replace(/[.,;:!?]+$/, "");
  const urls = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) urls.push(trim(m[0]));
  for (const m of text.matchAll(/\bwww\.[^\s<>"')]+/gi)) urls.push("https://" + trim(m[0]));
  return urls;
}

// Like extractOriginalSender, but returns BOTH the display name and the address from the FIRST
// forwarded "From:" line — because "who the email CLAIMS to be from" (the display name) vs "the
// address it's really from" is one of the strongest phishing tells (a "PayPal Security" name on a
// paypa1.com address). extractOriginalSender only gives the address; this gives us the pair.
//   "From: PayPal Security <no-reply@paypa1.com>" → { displayName: "PayPal Security", address: "no-reply@paypa1.com" }
//   "From: billing@acme.com"                       → { displayName: "", address: "billing@acme.com" }
// Returns null when there's no parseable From line / no address.
export const extractOriginalSenderParts = (body) => {
  if (typeof body !== "string" || !body.trim()) return null;
  const m = body.match(/^[>\s]*from:\s*(.+)$/im);
  if (!m) return null;
  const raw = m[1].trim();
  const address = extractEmailAddress(raw);
  if (!address) return null;
  // Display name = the text BEFORE the "<addr>" part (if the header uses that form). Strip quotes.
  const angled = raw.match(/^(.*?)<[^>]+>/);
  const displayName = (angled ? angled[1] : "").replace(/["']/g, "").trim();
  return { displayName, address };
}

// Parse the SPF / DKIM / DMARC results out of a raw email-headers blob. Gmail (and every real mail
// provider) checks these on receipt and writes them into the "Authentication-Results" header — they
// are the single most reliable signal of a FORGED sender, which is exactly what phishing filters
// key on. We only have them if the relay forwards the original headers (see DEPLOY.md); when it
// doesn't, `headers` is null/absent and this returns all-null (the auth leg is simply skipped).
//   "...dkim=pass header.i=@paypal.com; spf=pass; dmarc=pass..." → { spf:"pass", dkim:"pass", dmarc:"pass" }
// Pure string → object, so it's unit-testable with no network.
export const parseAuthResults = (headers) => {
  const empty = { spf: null, dkim: null, dmarc: null };
  if (typeof headers !== "string" || !headers) return empty;
  // Cap the scan: Authentication-Results sits in the TOP headers, so the first 50k is plenty. This
  // bounds the regex work if an upgraded relay forwards a huge raw-headers blob.
  const top = headers.slice(0, 50_000);
  const grab = (key) => {
    const m = top.match(new RegExp(`\\b${key}=([a-z]+)`, "i"));
    return m ? m[1].toLowerCase() : null;
  };
  return { spf: grab("spf"), dkim: grab("dkim"), dmarc: grab("dmarc") };
}

// Pull the <a href="..."> anchors out of an HTML email body as { text, href } pairs. In a PLAIN-text
// forward there are no anchors (so this returns []), but if the relay forwards the HTML body we can
// finally do the real "link_mismatch" check: does the visible link TEXT claim one destination while
// the href points somewhere else? Pure string → array; the mismatch decision lives in emailAnalysis.js.
// Bounds: slice the HTML to ~200k and return at most MAX_HTML_ANCHORS anchors, so a huge/hostile body
// can't drive an unbounded matchAll or an unbounded result array (the link_mismatch check only needs
// to find ONE disguised anchor — the first several are plenty).
const MAX_HTML_ANCHORS = 50;
export const extractHtmlLinks = (html) => {
  if (typeof html !== "string" || !html) return [];
  const capped = html.slice(0, 200_000);
  const links = [];
  for (const m of capped.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); // strip nested tags
    links.push({ text, href });
    if (links.length >= MAX_HTML_ANCHORS) break;
  }
  return links;
}
