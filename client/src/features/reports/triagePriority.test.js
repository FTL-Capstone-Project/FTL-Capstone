// ── analyst triage priority · tests · owner: Ozias ── (card G1·05)
import { describe, it, expect } from "vitest";
import { sortByPriority, isPending } from "./triagePriority.js";

// Helper to build a report row in the GET /api/history shape.
const row = (indicator_id, { status = null, ai_score = null, created_at = null } = {}) => ({
  indicator_id,
  ai_score,
  created_at,
  review: status ? { review_status: status } : null,
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
