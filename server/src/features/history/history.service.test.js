import { describe, it, expect } from "vitest";
import { scoreToKind, toReportJson } from "./history.service.js";

describe("scoreToKind (0-100 SAFETY score → verdict word)", () => {
  it("high score = safe", () => {
    expect(scoreToKind(91)).toBe("safe");
    expect(scoreToKind(70)).toBe("safe"); // boundary
  });
  it("middle score = review", () => {
    expect(scoreToKind(54)).toBe("review");
    expect(scoreToKind(35)).toBe("review"); // boundary (matches David's scoreBucket)
  });
  it("low score = dangerous", () => {
    expect(scoreToKind(22)).toBe("dangerous");
    expect(scoreToKind(0)).toBe("dangerous");
  });
  it("null (not scored yet) = review, not a crash", () => {
    expect(scoreToKind(null)).toBe("review");
  });
});

describe("toReportJson (DB row → Reports-card shape)", () => {
  // A submission joined with its indicator, the way the route includes it.
  const submission = {
    id: 5,
    rawUrl: "https://paypa1-secure.com/verify",
    createdAt: new Date("2026-07-08T00:00:00Z"),
    indicatorId: 1,
    indicator: {
      id: 1,
      aiScore: 22,
      aiVerdict: "Looks like a PayPal phishing page.",
      screenshotUrl: null,
    },
  };

  it("maps camelCase DB columns → snake_case card fields", () => {
    const r = toReportJson(submission, null, "David M.");
    expect(r.indicator_id).toBe(1);
    expect(r.url).toBe("https://paypa1-secure.com/verify");
    expect(r.ai_score).toBe(22);
    expect(r.kind).toBe("dangerous"); // derived from score 22
    expect(r.description).toBe("Looks like a PayPal phishing page.");
    expect(r.reported_by).toBe("David M.");
  });

  it("individual (no org review) → review is null", () => {
    const r = toReportJson(submission, null, "you");
    expect(r.review).toBe(null);
  });

  it("org member (has review) → nests review_status/human_score/reviewed_by", () => {
    const orgReview = {
      reviewStatus: "confirmed malicious",
      humanScore: 18,
      reviewedByUser: { name: "Priya S." },
    };
    const r = toReportJson(submission, orgReview, "David M.");
    expect(r.review).toEqual({
      review_status: "confirmed malicious",
      human_score: 18,
      reviewed_by: "Priya S.",
    });
  });

  it("falls back to 'you' when no reporter name is given", () => {
    const r = toReportJson(submission, null, null);
    expect(r.reported_by).toBe("you");
  });
});
