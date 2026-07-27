import { describe, it, expect } from "vitest";
import { buildReportEmailHtml } from "./reportEmailTemplate.js";

const base = {
  status: "done",
  ai_score: 12,
  ai_verdict: "This looks like a fake PayPal login page.",
  title: "Fake PayPal login",
  evidence: [
    { text: "2 links checked: 1 safe, 1 dangerous", severity: "dangerous" },
    { text: "paypa1-secure.com — Fake PayPal login page.", severity: "dangerous" },
  ],
  screenshot_url: null,
};

describe("buildReportEmailHtml", () => {
  it("renders the title, score, and verdict text", () => {
    const html = buildReportEmailHtml({ report: base, appUrl: "https://orbis.app" });
    expect(html).toContain("Fake PayPal login");
    expect(html).toContain(">12<"); // the score number
    expect(html).toContain("This looks like a fake PayPal login page.");
  });

  it("emits a threat-vector row per evidence entry (incl. the multi-link summary)", () => {
    const html = buildReportEmailHtml({ report: base });
    expect(html).toContain("2 links checked: 1 safe, 1 dangerous");
    expect(html).toContain("paypa1-secure.com — Fake PayPal login page.");
  });

  it("includes the <img> only when a screenshot is present", () => {
    expect(buildReportEmailHtml({ report: base })).not.toContain("<img");
    const withShot = buildReportEmailHtml({ report: { ...base, screenshot_url: "https://cdn/x.png" } });
    expect(withShot).toContain('<img src="https://cdn/x.png"');
  });

  it("escapes HTML in untrusted fields (a phishing subject can't inject markup)", () => {
    const html = buildReportEmailHtml({ report: { ...base, title: "<script>alert(1)</script>" } });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows the CTA button only when an appUrl is given", () => {
    expect(buildReportEmailHtml({ report: base })).not.toContain("View full report");
    expect(buildReportEmailHtml({ report: base, appUrl: "https://orbis.app" })).toContain("View full report");
  });

  it("falls back to a placeholder row when there's no evidence", () => {
    const html = buildReportEmailHtml({ report: { ...base, evidence: [] } });
    expect(html).toContain("We reviewed the sender and message content.");
  });
});

// The emailed report is the TWIN of the in-app "Why this score" panel — same content, same order,
// same advice. The only allowed differences are the ones email clients force (no collapse, no JS).
describe("buildReportEmailHtml — the 'Why this score' panel", () => {
  const mixed = {
    ...base,
    ai_score: 47,
    evidence: [
      { text: "Asks you to enter or confirm a password", severity: "dangerous", weight: 35 },
      { text: "Uses urgency or threats to rush you", severity: "review", weight: 6 },
      { text: "The wording reads oddly", severity: "review" },          // no weight
      { text: "Sender passed SPF and DKIM checks", severity: "safe" },
    ],
    next_steps: ["Don't enter your password.", "Verify with the sender."],
  };

  it("splits the rows into two LABELED groups instead of one 'Threat vectors' dump", () => {
    const html = buildReportEmailHtml({ report: mixed });
    expect(html).toContain("Why this score");
    expect(html).toContain("What raised concern (3)");
    expect(html).toContain("What checked out (1)");
    expect(html).not.toContain("Threat vectors");
  });

  it("renders BOTH groups expanded — no <details>, which Gmail strips", () => {
    const html = buildReportEmailHtml({ report: mixed });
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
    // the reassurance text is present in the markup, not hidden behind a toggle
    expect(html).toContain("Sender passed SPF and DKIM checks");
  });

  it("prints a signal's real cost, and nothing at all when we don't know it", () => {
    const html = buildReportEmailHtml({ report: mixed });
    expect(html).toContain("&minus;35 pts");
    expect(html).toContain("&minus;6 pts");
    // The weightless row appears, but no fabricated number rides along with it.
    expect(html).toContain("The wording reads oddly");
    expect(html.match(/&minus;\d+ pts/g)).toHaveLength(2);
  });

  it("shows no cost on a reassurance row that still carries a weight", () => {
    // Ozias's 91-scoring email: the soft rows keep weight 6/3 but are clamped to "safe", so they
    // land under "What checked out" — where a "−6 pts" chip would contradict the heading.
    const html = buildReportEmailHtml({
      report: { ...base, ai_score: 91, evidence: [{ text: "Uses urgency to rush you", severity: "safe", weight: 6 }] },
    });
    expect(html).toContain("Uses urgency to rush you");
    expect(html).not.toContain("pts");
  });

  it("drops the old fabricated bar widths (92% / 58% / 28%)", () => {
    const html = buildReportEmailHtml({ report: mixed });
    expect(html).not.toContain("width:92%");
    expect(html).not.toContain("width:58%");
    expect(html).not.toContain("width:28%");
  });

  it("renders the server's next_steps, and omits the section when there are none", () => {
    const html = buildReportEmailHtml({ report: mixed });
    expect(html).toContain("What to do");
    expect(html).toContain("Don't enter your password."); // esc() escapes < > & " — an apostrophe is fine in text
    expect(buildReportEmailHtml({ report: base })).not.toContain("What to do");
  });

  it("escapes advice and evidence text too (it can quote a phishing message)", () => {
    const html = buildReportEmailHtml({
      report: { ...base, evidence: [{ text: "<b>click</b>", severity: "review" }], next_steps: ["<img onerror=x>"] },
    });
    expect(html).not.toContain("<b>click</b>");
    expect(html).not.toContain("<img onerror=x>");
    expect(html).toContain("&lt;b&gt;click&lt;/b&gt;");
  });

  it("omits the concern group entirely on a clean report (no empty heading)", () => {
    const html = buildReportEmailHtml({
      report: { ...base, ai_score: 91, evidence: [{ text: "Sender passed SPF and DKIM checks", severity: "safe" }] },
    });
    expect(html).not.toContain("What raised concern");
    expect(html).toContain("What checked out (1)");
  });
});

// One verdict vocabulary everywhere: the email badge must say the same word as the in-app badge
// (VERDICT_STYLES) and the Reports filter. It used to say "Worth a closer look" where the app said
// "Suspicious", so filtering by one word opened a report labelled another.
describe("buildReportEmailHtml — verdict vocabulary", () => {
  it("uses Safe / Suspicious / Dangerous, matching the app badge", () => {
    expect(buildReportEmailHtml({ report: { ...base, ai_score: 91 } })).toContain(">Safe<");
    expect(buildReportEmailHtml({ report: { ...base, ai_score: 47 } })).toContain(">Suspicious<");
    expect(buildReportEmailHtml({ report: { ...base, ai_score: 12 } })).toContain(">Dangerous<");
  });

  it("no longer uses the old email-only wording", () => {
    const html = buildReportEmailHtml({ report: { ...base, ai_score: 47 } });
    expect(html).not.toContain("Worth a closer look");
    expect(html).not.toContain("Likely dangerous");
  });
});
