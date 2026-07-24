// ── feature: reputation · owner: Ozias ──
// HAND-CURATED allowlist of legitimate REGISTERED domains that should earn a trust floor even when
// they aren't (or aren't yet) in the bundled Tranco popularity list. This is the PRECISION layer of
// reputation.js: the bundled top-50k gives broad recall for the mainstream vendor ecosystem, but many
// perfectly-legitimate NICHE sites (a local business, a regional school, a small SaaS) rank far below
// 50k or aren't ranked at all — this is where we recognize them.
//
// HOW TO ADD A DOMAIN (the escape hatch):
//   1. Confirm it's genuinely legitimate (registered long ago, resolves, real business). A quick RDAP
//      check — `curl -H "Accept: application/rdap+json" https://rdap.org/domain/<domain>` — shows the
//      registration date; established (multi-year) registration is a good sanity check.
//   2. Add the bare REGISTERED domain (no scheme, no "www.", no path), lowercase, one per entry.
//   3. Do NOT add URL shorteners, website builders, or shared-hosting domains (bit.ly, *.pages.dev,
//      wordpress.com, amazonaws.com …) — those host arbitrary third-party pages and are denied by
//      reputation.js's NEVER_REPUTABLE set anyway. Reputation is about the SITE, not the platform.
//
// Being on this list is NOT a blanket "safe" — the callers only apply the floor when NO hard danger
// signal fired (blacklist / sandbox-malicious / brand impersonation / homoglyph). A reputable domain
// that gets compromised is still caught by Safe Browsing / urlscan and by the email body/link legs.
export const CURATED_REPUTABLE = [
  // ── The exact niche sites users forwarded that were wrongly flagged (all verified live +
  //    long-established via RDAP: scholarship.com 1999, collegeave.com 2004, simplebills.com 2008,
  //    fitnesssf.com 2012). These are the regression cases this whole change exists to fix. ──
  "scholarship.com",
  "collegeave.com",
  "collegeavestudentloans.com",
  "simplebills.com",
  "fitnesssf.com",

  // ── Email service / marketing platforms whose OWN corporate domain is trustworthy as a SENDER.
  //    NOTE: platforms that host arbitrary USER content (SurveyMonkey, Typeform, DocuSign, Eventbrite,
  //    Calendly, Google Forms, mailchimp's public campaign-archive.com …) are DELIBERATELY NOT here —
  //    a scammer can publish a phishing form/survey on any of them, so they're denied in reputation.js's
  //    NEVER_REPUTABLE set. A survey on a business's OWN domain (survey.fitnesssf.com) is still trusted
  //    via that domain; a survey hosted on surveymonkey.com is judged on its own merits, not floored. ──
  "mailchimp.com",
  "constantcontact.com",
  "klaviyo.com",
  "hubspot.com",
  "salesforce.com",
  "marketo.com",
  "sendinblue.com",
  "brevo.com",

  // ── Common billing / fintech companies small businesses send statements from (their own domains). ──
  "bill.com",
  "billtrust.com",
  "quickbooks.com",
  "intuit.com",
];
