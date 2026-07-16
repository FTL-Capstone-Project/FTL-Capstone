import { describe, it, expect, vi } from "vitest";
import { escalateSubmission } from "./submissions.service.js";

const mockPrisma = () => {
  return {
    submission: {
      update: vi.fn(async ({ where }) => ({ id: where.id, escalated: true })),
    },
    orgReview: {
      upsert: vi.fn(async ({ create }) => ({ id: 1, ...create })),
    },
  };
}

describe("escalateSubmission (O9)", () => {
  it("marks the submission escalated and upserts an OrgReview", async () => {
    const p = mockPrisma();
    const result = await escalateSubmission(p, { submissionId: 5, orgId: 2, indicatorId: 3 });

    expect(p.submission.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { escalated: true },
    });
    expect(p.orgReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_indicatorId: { orgId: 2, indicatorId: 3 } },
        create: { orgId: 2, indicatorId: 3, reviewStatus: "pending review" },
      })
    );
    expect(result.submission.escalated).toBe(true);
  });

  it("throws if required args are missing", async () => {
    const p = mockPrisma();
    await expect(escalateSubmission(p, { orgId: 2, indicatorId: 3 })).rejects.toThrow(/submissionId/);
    await expect(escalateSubmission(p, { submissionId: 5, indicatorId: 3 })).rejects.toThrow(/orgId/);
    await expect(escalateSubmission(p, { submissionId: 5, orgId: 2 })).rejects.toThrow(/indicatorId/);
  });

  it("re-escalation preserves an existing analyst verdict (upsert update is a no-op)", async () => {
    // The unique key means a second escalation of the same URL for the same org
    // must NOT reset the analyst's work — update: {} leaves their verdict intact.
    const p = mockPrisma();
    // Simulate a row the analyst already reviewed being returned by the upsert.
    p.orgReview.upsert = vi.fn(async () => ({
      id: 1, orgId: 2, indicatorId: 3, reviewStatus: "confirmed malicious", humanScore: 12,
    }));

    const result = await escalateSubmission(p, { submissionId: 5, orgId: 2, indicatorId: 3 });

    // The upsert is called with an EMPTY update body (don't touch existing review).
    expect(p.orgReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} })
    );
    // The analyst's verdict survives.
    expect(result.orgReview.reviewStatus).toBe("confirmed malicious");
  });
});
