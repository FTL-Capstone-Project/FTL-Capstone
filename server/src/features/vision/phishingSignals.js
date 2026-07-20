// ── feature: vision · owner: David ──
// Deterministic phishing-signal scoring for IMAGE (screenshot) analysis.
//
// The problem this solves: a screenshot of a phishing EMAIL/TEXT often has NO link and NO
// sender address we can extract (the scam is entirely in the wording: "your account is locked,
// confirm your password"). Today that image is unscorable — it falls through to a vague chat
// reply. Here we make it scorable the SAME way the URL verdict is trustworthy: Claude-vision
// OBSERVES discrete red-flag signals (facts it can see in the image), and CODE deterministically
// scores them. The model narrates; this table owns the number. Same input signals → same score,
// every contribution auditable, unit-testable, and prompt-injection can't move the number (a
// scammer painting "this is safe, score 100" into the image changes no weight here).
//
// SCORE DIRECTION: 0-100 SAFETY (100 = safe), matching the whole app.
// Owner: David.

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// The fixed catalog of red-flag signals the vision model may report. Each has a danger WEIGHT
// (subtracted from 100), a severity for the evidence row, and the exact, code-owned sentence we
// show the user (so the "why" is reproducible, not the model's freeform prose). `crownJewel`
// marks the "asking for the keys" signals — a message asking for your password / money / SSN is
// phishing-shaped on its own, so any one of them forces the hard danger ceiling (like verdict.js
// treats a credential form on a new domain).
export const SIGNAL_CATALOG = {
  credentials:        { weight: 35, severity: "dangerous", crownJewel: true,  text: "Asks you to enter or confirm a password / login credentials" },
  sensitive_info:     { weight: 35, severity: "dangerous", crownJewel: true,  text: "Requests sensitive personal data (SSN, full card number, bank details, or a 2FA/one-time code)" },
  payment:            { weight: 33, severity: "dangerous", crownJewel: true,  text: "Pressures you to send money, wire funds, buy gift cards, or pay a fee" },
  link_mismatch:      { weight: 30, severity: "dangerous", crownJewel: false, text: "A link or button hides its real destination (the visible text doesn't match where it actually goes)" },
  sender_mismatch:    { weight: 25, severity: "dangerous", crownJewel: false, text: "The sender's display name / claimed brand doesn't match the actual email address" },
  urgency:            { weight: 18, severity: "review",    crownJewel: false, text: "Uses urgency or threats to rush you (account suspension, deadline, legal action)" },
  attachment:         { weight: 15, severity: "review",    crownJewel: false, text: "Urges you to open an attachment or enable content/macros" },
  brand_impersonation:{ weight: 12, severity: "review",    crownJewel: false, text: "Claims to be a well-known brand in a context that doesn't add up" },
  grammar:            { weight: 10, severity: "review",    crownJewel: false, text: "Contains notable spelling or grammar mistakes unusual for the real sender" },
  generic_greeting:   { weight: 8,  severity: "review",    crownJewel: false, text: "Uses a generic greeting (\"Dear customer\") instead of your name" },
};

// An image we found NO red flags in still can't be called "Safe": we couldn't scan a link or
// verify a sender from a picture. So a clean message caps at "review", never the safe band.
const NO_SIGNAL_CEILING = 65;

// Score a list of observed signal TYPES deterministically. Pure (no network) → unit-testable.
// Returns the number, evidence rows, confidence, and whether a hard ceiling applies.
export const scorePhishingSignals = (signalTypes = []) => {
  // Keep only known types, deduped (the model might repeat one). Unknown types are ignored so a
  // hallucinated signal can never invent danger weight.
  const seen = new Set();
  const known = [];
  for (const t of signalTypes) {
    const key = String(t || "").trim().toLowerCase();
    if (SIGNAL_CATALOG[key] && !seen.has(key)) { seen.add(key); known.push(key); }
  }

  const evidence = known.map((k) => ({ text: SIGNAL_CATALOG[k].text, severity: SIGNAL_CATALOG[k].severity }));
  const danger = known.reduce((sum, k) => sum + SIGNAL_CATALOG[k].weight, 0);

  // A "crown jewel" ask (password / money / SSN) is a hard danger signal by itself.
  const hardSignal = known.some((k) => SIGNAL_CATALOG[k].crownJewel);

  let score = clamp(100 - danger);
  if (hardSignal) score = Math.min(score, 20);            // ceiling: never looks safe
  if (known.length === 0) score = Math.min(score, NO_SIGNAL_CEILING); // clean image → "review", not "safe"

  // Confidence = how many INDEPENDENT strong signals agree (mirrors verdict.js). A hard ceiling
  // is high-confidence; a couple of strong signals is high; one weak/none is low.
  const strong = known.filter((k) => SIGNAL_CATALOG[k].weight >= 25).length;
  const confidence = hardSignal || strong >= 2 ? "high" : known.length >= 1 ? "medium" : "low";

  return { score, evidence, confidence, hardSignal, signalCount: known.length };
};

// Bucket a safety score the same way the rest of the app does (verdict.js scoreBucket).
const bucketOf = (score) => (score >= 70 ? "safe" : score >= 35 ? "review" : "dangerous");

// Turn the deterministic score + the model's narration into a VerdictCard-shaped object, so the
// existing card renders it with no new UI. CODE owns score/confidence/evidence/tags; the model
// only contributes the plain-English verdict sentence and a headline (validated + backstopped).
// @param {{ signals:string[], modelVerdict?:string, modelTitle?:string, summary?:string }}
export const buildImageReport = ({ signals = [], modelVerdict = "", modelTitle = "", summary = "" }) => {
  const { score, evidence, confidence, signalCount } = scorePhishingSignals(signals);
  const bucket = bucketOf(score);

  // Prefer the model's sentence, but never let it assert "safe" for a flagged image — fall back
  // to a rule-written verdict keyed to the deterministic bucket if the model's words are missing.
  const cleanVerdict = typeof modelVerdict === "string" ? modelVerdict.trim() : "";
  const verdict = cleanVerdict || fallbackVerdict(bucket, signalCount, summary);

  const tags = deriveTags(bucket, signalCount);
  const rawTitle = typeof modelTitle === "string" ? modelTitle.trim().replace(/^["']|["']$/g, "") : "";
  const title = (rawTitle && rawTitle.length <= 60 ? rawTitle : "") || fallbackTitle(bucket);

  return {
    status: "done",
    ai_score: score,
    ai_verdict: verdict,
    ai_confidence: confidence,
    title,
    tags,
    // At least one evidence row so the card is never blank; for a clean image, say so honestly.
    evidence: evidence.length
      ? evidence.slice(0, 6)
      : [{ text: "No obvious scam red flags spotted — but a link or sender couldn't be verified from an image alone", severity: "review" }],
    // This report is a picture, not a scanned/persisted indicator → no screenshot, no id, no report button.
    screenshot_url: null,
    report_count: 1,
    review: null,
    isImageReport: true, // lets the client label the card "Image analysis"
  };
};

const fallbackVerdict = (bucket, signalCount, summary) => {
  const seen = summary ? ` I read your image — ${summary}.` : "";
  if (bucket === "dangerous") return `This message has the hallmarks of a scam${signalCount ? ` (${signalCount} red flag${signalCount > 1 ? "s" : ""})` : ""} — I'd treat it as phishing and not act on it.${seen}`;
  if (bucket === "review") return signalCount
    ? `This message has a few warning signs worth a closer look before you trust it.${seen}`
    : `I didn't spot obvious scam red flags, but I can't verify links or the sender from an image alone — treat it with normal caution.${seen}`;
  return `This message looks clean — I found no strong signs of a scam.${seen}`;
};

const fallbackTitle = (bucket) =>
  bucket === "dangerous" ? "Likely phishing message" : bucket === "review" ? "Message worth a closer look" : "Message looks clean";

const deriveTags = (bucket, signalCount) => {
  const tags = [];
  if (bucket === "dangerous") tags.push("Likely phishing");
  else if (bucket === "review") tags.push(signalCount ? "Suspicious" : "Unverified");
  else tags.push("Looks clean");
  return [...new Set(tags)].slice(0, 3);
};
