// ── feature: reports · owner: Ozias ──
// "What to do" — the short, ordered list of actions we show under a report's explanation panel.
//
// The problem this solves: the old report told you a score and a paragraph of reasoning, and
// stopped. A user who read "this may not be trustworthy" still had no idea what to DO. Worse, the
// one piece of advice we did give ("verify with the sender through a channel you trust") was
// hard-coded boilerplate at the bottom of every emailed report, whether the link was a confirmed
// blacklist hit or a clean corporate homepage.
//
// Why this is CODE and not the LLM: advice that contradicts the score is worse than no advice.
// A model that writes "don't click this" under a green Safe badge (which is exactly the
// score↔prose mismatch we just spent Group 1 fixing) makes the whole report untrustworthy. So the
// steps are picked deterministically from the bucket + the signals that actually fired. Same
// inputs → same advice, and it can never disagree with the number.
//
// Why it lives on the SERVER: the in-app modal and the emailed report must give identical advice,
// and there's no shared client/server package in this repo (`workspaces: [client, server]`, no
// `shared/`). Both surfaces already read from `readIndicatorForClient` — the report email service
// passes its output straight to the template — so computing it once there means the two can't drift.

// Advice keyed to a SPECIFIC signal we detected, so the step names the real problem instead of
// generic caution. Keys are `SIGNAL_CATALOG` keys from the email path (phishingSignals.js) — they
// ride along on each evidence row as `signal`. Ordered most-actionable first within a report.
const STEP_FOR_SIGNAL = {
  credentials: "Don't enter your password. If you think the request might be real, open the site yourself from your browser instead of using this message's link.",
  sensitive_info: "Don't send personal details (SSN, card numbers, or a one-time code). Real companies never ask for those by email.",
  payment: "Don't send money, wire funds, or buy gift cards based on this message — that's the hardest kind of scam to reverse.",
  link_mismatch: "Hover over the link before clicking to see where it really goes — the visible text and the real destination don't match here.",
  sender_mismatch: "Check the sender's actual email address, not just the display name — the name and the address don't match.",
  attachment: "Don't open the attachment or enable content/macros — that's a common way malware gets installed.",
  brand_impersonation: "Contact the company through a number or address you already have (their official site or the back of your card), not the details in this message.",
};

// The baseline advice for each verdict band, used when no specific signal advice applies (URL
// checks and older rows have no `signal` keys). Always at least one step, so the panel is never
// empty — a safe report gets a short "you're fine, here's the habit to keep" line rather than
// silence, which is what makes the safe case feel answered rather than ignored.
const STEPS_FOR_BUCKET = {
  dangerous: [
    "Don't click the link or reply to the message.",
    "Delete it, and if it claims to be from a company you use, report it to them.",
  ],
  review: [
    "Verify with the sender through a channel you already trust — a saved number or the company's official site, not the contact details in this message.",
    "Don't enter passwords or payment details until you've confirmed it's genuine.",
  ],
  safe: [
    "Nothing looks wrong here, but keep the habit: type important addresses yourself instead of following links you didn't expect.",
  ],
};

// Channel-specific closers. A forwarded email has one action a URL check doesn't (report it in your
// mail client so future copies get filtered), and a URL check has one an email doesn't.
const STEP_FOR_SOURCE = {
  email: {
    dangerous: "Mark it as phishing/spam in your email app so similar messages get filtered.",
    review: "If it turns out to be fake, mark it as phishing in your email app.",
  },
  web: {
    dangerous: "If you already entered a password on this page, change it now — and anywhere you reused it.",
  },
};

// Build the ordered advice list for one report.
//
// @param bucket  "safe" | "review" | "dangerous" — the FINAL verdict band (the analyst's if they
//                overrode Orbo), so the advice follows the badge the user is actually looking at.
// @param signals array of SIGNAL_CATALOG keys that fired (email path only; empty for URL checks).
// @param source  "web" | "email" — how this indicator was submitted.
// @returns array of plain strings, most important first, capped at 4 so it stays scannable.
export const buildNextSteps = ({ bucket = "review", signals = [], source = "web" } = {}) => {
  const band = STEPS_FOR_BUCKET[bucket] ? bucket : "review";
  const steps = [];
  const push = (step) => {
    // Dedupe: a signal step and a bucket step can express the same action ("don't enter your
    // password"), and repeating it makes the list look padded.
    if (step && !steps.includes(step)) steps.push(step);
  };

  // Signal-specific advice first — it names the actual problem, which is the whole point. Skipped
  // on a SAFE verdict: a lone soft signal (a deadline, "Dear customer") is not a reason to tell
  // someone their safe mail is dangerous, and after Group 1 those are exactly the rows that
  // survive on a safe report.
  if (band !== "safe" && Array.isArray(signals)) {
    for (const signal of signals) {
      push(STEP_FOR_SIGNAL[String(signal ?? "").trim().toLowerCase()]);
    }
  }

  for (const step of STEPS_FOR_BUCKET[band]) push(step);
  push(STEP_FOR_SOURCE[source]?.[band]);

  return steps.slice(0, 4);
};
