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
export const extractFirstUrl = (text) => {
  if (typeof text !== "string") return null;
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;:!?]+$/, "");
}
