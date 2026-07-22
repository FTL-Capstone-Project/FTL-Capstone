// ── analyst triage priority · tests · owner: Ozias ── (card G1·05)
import { describe, it, expect } from "vitest";
import { sortByPriority, isPending, groupByCampaign, isForwardedEmail } from "./triagePriority.js";

// Helper to build a report row in the GET /api/history shape.
const row = (indicator_id, { status = null, ai_score = null, created_at = null, campaign_id = null } = {}) => ({
  indicator_id,
  ai_score,
  created_at,
  review: (status || campaign_id != null)
    ? { review_status: status, campaign_id }
    : null,
});

describe("isPending", () => {
  it("treats no-review and pending/investigating as open", () => {
    expect(isPending(row(1))).toBe(true);                                // no review yet
    expect(isPending(row(2, { status: "pending review" }))).toBe(true);
    expect(isPending(row(3, { status: "investigating" }))).toBe(true);
  });

  it("treats confirmed verdicts as closed", () => {
    expect(isPending(row(4, { status: "confirmed malicious" }))).toBe(false);
    expect(isPending(row(5, { status: "confirmed safe" }))).toBe(false);
  });
});

describe("isForwardedEmail", () => {
  it("is true only when the report's source is 'email'", () => {
    expect(isForwardedEmail({ source: "email" })).toBe(true);
    expect(isForwardedEmail({ source: "web" })).toBe(false);
    expect(isForwardedEmail({})).toBe(false); // missing source → not forwarded
  });
});

describe("sortByPriority", () => {
  it("puts open items before confirmed ones", () => {
    const sorted = sortByPriority([
      row(1, { status: "confirmed safe", ai_score: 90 }),
      row(2, { status: "pending review", ai_score: 90 }),
    ]);
    expect(sorted.map((r) => r.indicator_id)).toEqual([2, 1]);
  });

  it("within the same group, ranks more dangerous (lower score) first", () => {
    const sorted = sortByPriority([
      row(1, { status: "pending review", ai_score: 80 }),
      row(2, { status: "pending review", ai_score: 20 }),
      row(3, { status: "pending review", ai_score: 55 }),
    ]);
    expect(sorted.map((r) => r.indicator_id)).toEqual([2, 3, 1]);
  });

  it("breaks ties by recency (newest first)", () => {
    const sorted = sortByPriority([
      row(1, { status: "pending review", ai_score: 50, created_at: "2026-07-01" }),
      row(2, { status: "pending review", ai_score: 50, created_at: "2026-07-10" }),
    ]);
    expect(sorted.map((r) => r.indicator_id)).toEqual([2, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [row(1, { ai_score: 10 }), row(2, { ai_score: 90 })];
    const copy = [...input];
    sortByPriority(input);
    expect(input).toEqual(copy);
  });
});

describe("groupByCampaign", () => {
  const campaigns = [{ id: 1, name: "Bank impersonation" }];

  it("collapses same-campaign reports into one item, keeps others standalone", () => {
    const items = groupByCampaign(
      [row(1, { campaign_id: 1 }), row(2), row(3, { campaign_id: 1 })],
      campaigns
    );
    // One campaign item (with 2 reports) + one standalone report.
    expect(items).toHaveLength(2);
    const campaignItem = items.find((i) => i.type === "campaign");
    expect(campaignItem.name).toBe("Bank impersonation");
    expect(campaignItem.reports.map((r) => r.indicator_id)).toEqual([1, 3]);
    expect(items.filter((i) => i.type === "report")).toHaveLength(1);
  });

  it("places the campaign group at its highest-priority member's position", () => {
    // Input order = priority order. A standalone item sits between two campaign rows;
    // the group should appear where its FIRST (top-priority) member was → index 0.
    const items = groupByCampaign(
      [row(1, { campaign_id: 1 }), row(2), row(3, { campaign_id: 1 })],
      campaigns
    );
    expect(items[0].type).toBe("campaign");
    expect(items[1].type).toBe("report");
  });

  it("falls back to a placeholder name when the campaign isn't in the list", () => {
    const items = groupByCampaign([row(1, { campaign_id: 9 })], []);
    expect(items[0]).toMatchObject({ type: "campaign", name: "Campaign #9" });
  });

  it("returns all standalone items when no campaigns are present", () => {
    const items = groupByCampaign([row(1), row(2)], []);
    expect(items.every((i) => i.type === "report")).toBe(true);
  });
});
