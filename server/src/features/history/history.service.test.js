import { describe, it, expect, vi } from "vitest";
import { scoreToKind, effectiveKind, toReportJson, setArchivedForUser, deleteForUser } from "./history.service.js";

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

  it("org member (has review) → nests review_status/human_score/human_verdict/reviewed_by/shared_with_org/campaign_id", () => {
    const reviewedAt = new Date("2026-07-08T10:00:00Z");
    const orgReview = {
      reviewStatus: "confirmed malicious",
      humanScore: 18,
      humanVerdict: "SPF/DKIM failing; registrar 72h old.",
      sharedWithOrg: true,
      reviewedByUser: { name: "Priya S." },
      updatedAt: reviewedAt,
      campaignId: 7,
    };
    const r = toReportJson(submission, orgReview, "David M.");
    expect(r.review).toEqual({
      review_status: "confirmed malicious",
      human_score: 18,
      // The analyst's notes come back so the review form can prefill instead of blanking them.
      human_verdict: "SPF/DKIM failing; registrar 72h old.",
      reviewed_by: "Priya S.",
      // Dated so the UI can attribute the verdict ("Priya S. · Jul 8, 2026").
      reviewed_at: reviewedAt,
      shared_with_org: true,
      campaign_id: 7,
    });
  });

  it("review with no notes yet → human_verdict is null (never undefined)", () => {
    const orgReview = { reviewStatus: "pending review", humanScore: null, sharedWithOrg: false, reviewedByUser: null };
    const r = toReportJson(submission, orgReview, "David M.");
    expect(r.review.human_verdict).toBe(null);
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

// The closure loop's whole premise: an analyst records an authoritative verdict and it OVERRIDES the
// AI. Before this, `kind` (which picks the card's badge + color) always came from the AI score — so an
// analyst could confirm something malicious and the reporter still saw a green "Looks safe" card. The
// analyst's decision was written to the DB and then ignored by every surface that mattered.
describe("effectiveKind — the analyst's verdict beats Orbo's score", () => {
  it("uses the analyst's score when they recorded one", () => {
    // Orbo said safe (91); the analyst looked and scored it 10. The analyst wins.
    expect(effectiveKind(91, { humanScore: 10, reviewStatus: "confirmed malicious" })).toBe("dangerous");
    // ...and in the other direction: Orbo's false positive, cleared by a human.
    expect(effectiveKind(20, { humanScore: 95, reviewStatus: "confirmed safe" })).toBe("safe");
  });

  it("a confirmed status alone is a verdict, even with no score typed", () => {
    expect(effectiveKind(91, { humanScore: null, reviewStatus: "confirmed malicious" })).toBe("dangerous");
    expect(effectiveKind(20, { humanScore: null, reviewStatus: "confirmed safe" })).toBe("safe");
  });

  it("work-in-progress statuses do NOT override — Orbo's verdict still shows", () => {
    // Opening a ticket isn't a conclusion. If these overrode, starting triage would blank out the
    // only verdict the reporter has.
    expect(effectiveKind(22, { humanScore: null, reviewStatus: "pending review" })).toBe("dangerous");
    expect(effectiveKind(91, { humanScore: null, reviewStatus: "investigating" })).toBe("safe");
  });

  it("falls back to the AI score with no review at all (individuals have no analyst)", () => {
    expect(effectiveKind(22, null)).toBe("dangerous");
    expect(effectiveKind(91, undefined)).toBe("safe");
    expect(effectiveKind(null, null)).toBe("review");
  });

  it("the CARD reflects the analyst too (regression: green 'Looks safe' on a confirmed-malicious item)", () => {
    // Orbo scored this 91 (green, "Looks safe"); an analyst then confirmed it malicious.
    const safeLookingSubmission = {
      id: 9,
      rawUrl: "https://example.com/promo",
      createdAt: new Date("2026-07-08T00:00:00Z"),
      indicatorId: 2,
      indicator: { id: 2, aiScore: 91, aiTitle: "Looks fine", aiTags: [], screenshotUrl: null },
    };
    const r = toReportJson(safeLookingSubmission, { humanScore: 10, reviewStatus: "confirmed malicious" }, "David M.");
    expect(r.kind).toBe("dangerous");   // what colors the card
    expect(r.ai_score).toBe(91);        // Orbo's number is still visible as the secondary figure
  });
});
