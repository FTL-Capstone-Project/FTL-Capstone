import { describe, it, expect, vi } from "vitest";
import { scoreToKind, toReportJson, setArchivedForUser, deleteForUser } from "./history.service.js";

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
      aiTitle: "Fake PayPal login",
      aiDescription: "Credential phishing on a lookalike domain.",
      aiTags: ["Credential phishing"],
      screenshotUrl: null,
    },
  };

  it("maps camelCase DB columns → snake_case card fields", () => {
    const r = toReportJson(submission, null, "David M.");
    expect(r.indicator_id).toBe(1);
    expect(r.url).toBe("https://paypa1-secure.com/verify");
    expect(r.ai_score).toBe(22);
    expect(r.kind).toBe("dangerous"); // derived from score 22
    expect(r.title).toBe("Fake PayPal login");
    expect(r.description).toBe("Credential phishing on a lookalike domain.");
    expect(r.tags).toEqual(["Credential phishing"]);
    expect(r.reported_by).toBe("David M.");
    expect(r.source).toBe("web"); // defaults to web when the row has no explicit source
  });

  it("surfaces source 'email' for a forwarded-email report (drives the card's Email badge)", () => {
    const r = toReportJson({ ...submission, source: "email" }, null, "David M.");
    expect(r.source).toBe("email");
  });

  it("individual (no org review) → review is null", () => {
    const r = toReportJson(submission, null, "you");
    expect(r.review).toBe(null);
  });

  it("org member (has review) → nests review_status/human_score/reviewed_by/shared_with_org/campaign_id", () => {
    const orgReview = {
      reviewStatus: "confirmed malicious",
      humanScore: 18,
      sharedWithOrg: true,
      reviewedByUser: { name: "Priya S." },
      campaignId: 7,
    };
    const r = toReportJson(submission, orgReview, "David M.");
    expect(r.review).toEqual({
      review_status: "confirmed malicious",
      human_score: 18,
      reviewed_by: "Priya S.",
      shared_with_org: true,
      campaign_id: 7,
    });
  });

  it("review with no campaign → campaign_id is null", () => {
    const orgReview = { reviewStatus: "pending review", humanScore: null, sharedWithOrg: false, reviewedByUser: null };
    const r = toReportJson(submission, orgReview, "David M.");
    expect(r.review.campaign_id).toBe(null);
  });

  it("falls back to 'you' when no reporter name is given", () => {
    const r = toReportJson(submission, null, null);
    expect(r.reported_by).toBe("you");
  });
});

describe("setArchivedForUser (soft-archive / restore the caller's own submissions)", () => {
  it("archive → writes the given timestamp, scoped to userId + indicatorId", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const now = new Date("2026-07-22T00:00:00Z");
    const count = await setArchivedForUser(
      { submission: { updateMany } },
      { userId: 5, indicatorId: 42, archived: true, now }
    );
    expect(count).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 5, indicatorId: 42 },
      data: { archivedAt: now },
    });
  });

  it("restore (archived:false) → sets archivedAt back to null", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await setArchivedForUser(
      { submission: { updateMany } },
      { userId: 5, indicatorId: 42, archived: false, now: new Date() }
    );
    expect(updateMany.mock.calls[0][0].data).toEqual({ archivedAt: null });
  });
});

describe("deleteForUser (hard-delete the caller's own submissions only)", () => {
  it("deletes rows scoped to userId + indicatorId and returns the count", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const count = await deleteForUser({ submission: { deleteMany } }, { userId: 5, indicatorId: 42 });
    expect(count).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 5, indicatorId: 42 } });
  });
});
