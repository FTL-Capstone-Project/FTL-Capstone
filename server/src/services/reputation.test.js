import { describe, it, expect } from "vitest";
import { isReputableDomain, NEVER_REPUTABLE } from "./reputation.js";

// reputation.js is the one POSITIVE trust signal in the scorer. These lock in the three layers
// (curated allowlist, bundled popularity list, UGC/hosting denylist) and — most importantly — the
// false-negative guards: a popular SHARED-HOSTING domain must never read as reputable.
describe("isReputableDomain", () => {
  it("recognizes the exact niche sites users forwarded (curated allowlist)", () => {
    // The whole reason this feature exists — these were wrongly flagged before.
    expect(isReputableDomain("scholarship.com")).toBe(true);
    expect(isReputableDomain("collegeave.com")).toBe(true);
    expect(isReputableDomain("simplebills.com")).toBe(true);
    expect(isReputableDomain("fitnesssf.com")).toBe(true);
  });

  it("folds a subdomain to its registered domain (inherits the parent's reputation)", () => {
    // A gym survey link is usually on a subdomain / an ESP tracker that ends at the real host.
    expect(isReputableDomain("survey.fitnesssf.com")).toBe(true);
    expect(isReputableDomain("click.e.collegeave.com")).toBe(true);
    expect(isReputableDomain("www.scholarship.com")).toBe(true);
  });

  it("recognizes mainstream ESP corporate domains (trustworthy as a sender)", () => {
    expect(isReputableDomain("mailchimp.com")).toBe(true);
    expect(isReputableDomain("hubspot.com")).toBe(true);
  });

  it("does NOT trust popular shared-hosting / shortener domains (the FN guard)", () => {
    // These rank HIGH in Tranco but host arbitrary third-party pages — a phishing page on one of them
    // must never inherit a trust floor.
    expect(isReputableDomain("evil-phish.pages.dev")).toBe(false);
    expect(isReputableDomain("scam.github.io")).toBe(false);
    expect(isReputableDomain("bit.ly")).toBe(false);
    expect(isReputableDomain("some-bucket.amazonaws.com")).toBe(false);
    expect(isReputableDomain("attacker.wixsite.com")).toBe(false);
    expect(isReputableDomain("phish.azurewebsites.net")).toBe(false);
  });

  it("does NOT trust user-content platforms (survey / form / e-sign) — a scam page can live on them", () => {
    // The subtle FN hole caught during development: SurveyMonkey/Typeform/DocuSign are legit companies,
    // but a phishing survey / fake "document to sign" hosted on their domain must NOT be auto-trusted.
    // A survey on a business's OWN domain (survey.fitnesssf.com) is still trusted; one on
    // surveymonkey.com is judged on its own merits.
    expect(isReputableDomain("myscam.typeform.com")).toBe(false);
    expect(isReputableDomain("phishing-survey.surveymonkey.com")).toBe(false);
    expect(isReputableDomain("fake-doc.docusign.net")).toBe(false);
    expect(isReputableDomain("evil.eventbrite.com")).toBe(false);
    expect(isReputableDomain("scam-form.google.com")).toBe(false);
  });

  it("does NOT trust unknown / lookalike / throwaway domains", () => {
    expect(isReputableDomain("totally-random-scam-xyz123.com")).toBe(false);
    expect(isReputableDomain("paypa1-verify.net")).toBe(false);
    expect(isReputableDomain("microsoft365-signin-verify.com")).toBe(false);
  });

  it("handles junk / empty input without throwing", () => {
    expect(isReputableDomain("")).toBe(false);
    expect(isReputableDomain(null)).toBe(false);
    expect(isReputableDomain(undefined)).toBe(false);
    expect(isReputableDomain("not a domain")).toBe(false);
  });

  it("is deterministic (same input → same answer)", () => {
    expect(isReputableDomain("scholarship.com")).toBe(isReputableDomain("scholarship.com"));
  });

  it("exposes the denylist so the generator filters the same set", () => {
    expect(NEVER_REPUTABLE.has("bit.ly")).toBe(true);
    expect(NEVER_REPUTABLE.has("pages.dev")).toBe(true);
    expect(NEVER_REPUTABLE.has("amazonaws.com")).toBe(true);
  });
});
