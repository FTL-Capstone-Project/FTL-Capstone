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
