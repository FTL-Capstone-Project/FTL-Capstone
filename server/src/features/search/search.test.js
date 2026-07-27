// ── search · tests · owner: David ──
// Covers GET /api/search?q=: term validation, the org-scoping WHERE (the security boundary),
// result shaping/dedup, and the analyst-only route guard.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Part 1 — service unit tests (hand-built mock Prisma, no DB).
// ---------------------------------------------------------------------------
const { parseQuery, buildSearchWhere, searchOrgHistory, MAX_RESULTS, MIN_QUERY_LENGTH } =
  await import("./search.service.js");

describe("parseQuery", () => {
  it("rejects a missing, empty, or whitespace-only term", () => {
    for (const bad of [undefined, null, "", "   ", 42, {}]) {
      expect(parseQuery(bad).ok).toBe(false);
    }
  });

  it(`rejects a term shorter than ${MIN_QUERY_LENGTH} characters`, () => {
    expect(parseQuery("a").ok).toBe(false);
  });

  it("rejects an absurdly long term", () => {
    expect(parseQuery("x".repeat(201)).ok).toBe(false);
  });

  it("trims and accepts a normal term", () => {
    expect(parseQuery("  paypal  ")).toEqual({ ok: true, term: "paypal" });
  });
});

describe("buildSearchWhere", () => {
  it("ALWAYS pins orgId — the data-isolation boundary", () => {
    expect(buildSearchWhere(99, "paypal").orgId).toBe(99);
  });

  it("matches rawUrl, domain, aiTitle and aiDescription, case-insensitively", () => {
    const where = buildSearchWhere(99, "paypal");
    expect(where.OR).toHaveLength(4);
    // Every branch must be case-insensitive, or "PayPal" wouldn't find "paypal".
    const modes = JSON.stringify(where.OR).match(/insensitive/g);
    expect(modes).toHaveLength(4);
    expect(where.OR[0]).toEqual({ rawUrl: { contains: "paypal", mode: "insensitive" } });
    expect(where.OR[1]).toEqual({ indicator: { domain: { contains: "paypal", mode: "insensitive" } } });
    expect(where.OR[2]).toEqual({ indicator: { aiTitle: { contains: "paypal", mode: "insensitive" } } });
    expect(where.OR[3]).toEqual({ indicator: { aiDescription: { contains: "paypal", mode: "insensitive" } } });
  });

  it("treats a SQL-ish term as literal text (Prisma parameterizes it)", () => {
    // The term must be carried as a VALUE, never spliced into SQL. If this ever changes shape,
    // this test is the tripwire.
    const where = buildSearchWhere(1, "%' OR 1=1 --");
    expect(where.OR[0].rawUrl.contains).toBe("%' OR 1=1 --");
  });
});

const submissionRow = (id, indicatorId, overrides = {}) => ({
  id,
  indicatorId,
  rawUrl: `https://example.com/${id}`,
  createdAt: new Date(`2026-07-${String(id).padStart(2, "0")}T00:00:00Z`),
  source: "web",
  user: { name: `User ${id}` },
  indicator: {
    id: indicatorId,
    aiTitle: "Fake PayPal login",
    aiDescription: "Credential harvesting page",
    aiTags: [],
    aiScore: 10,
    screenshotUrl: null,
    ...overrides.indicator,
  },
  ...overrides,
});

const mockPrisma = ({ submissions = [], reviews = [] } = {}) => ({
  submission: { findMany: vi.fn(async () => submissions) },
  orgReview: { findMany: vi.fn(async () => reviews) },
});

describe("searchOrgHistory", () => {
  it("returns empty (and never queries) for a caller with no org", async () => {
    const p = mockPrisma();
    expect(await searchOrgHistory(p, { orgId: null, term: "paypal" })).toEqual({ reports: [], truncated: false });
    expect(p.submission.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the caller's org and returns ReportCard-shaped rows", async () => {
    const p = mockPrisma({ submissions: [submissionRow(1, 10)] });
    const { reports } = await searchOrgHistory(p, { orgId: 99, term: "paypal" });

    expect(p.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 99 }) })
    );
    // Same shape GET /api/history?org=1 returns, so ReportCard renders it unchanged.
    expect(reports[0]).toMatchObject({
      indicator_id: 10,
      title: "Fake PayPal login",
      kind: "dangerous",   // aiScore 10 → dangerous
      ai_score: 10,
      reported_by: "User 1",
      review: null,
    });
  });

  it("collapses duplicate reports of the same indicator into ONE result", async () => {
    // Two teammates reported the same URL → one card, not two.
    const p = mockPrisma({ submissions: [submissionRow(2, 10), submissionRow(1, 10)] });
    const { reports } = await searchOrgHistory(p, { orgId: 99, term: "paypal" });
    expect(reports).toHaveLength(1);
    expect(reports[0].reported_by).toBe("User 2"); // the newest row wins (rows arrive newest-first)
  });

  it("attaches this org's review to a matched indicator (any status, analyst view)", async () => {
    const p = mockPrisma({
      submissions: [submissionRow(1, 10)],
      reviews: [{ indicatorId: 10, reviewStatus: "investigating", humanScore: null,
        sharedWithOrg: false, campaignId: null, reviewedByUser: { name: "Ana" } }],
    });
    const { reports } = await searchOrgHistory(p, { orgId: 99, term: "paypal" });
    // Unshared reviews ARE included here — an analyst must be able to find in-progress work.
    expect(reports[0].review).toMatchObject({ review_status: "investigating", reviewed_by: "Ana" });
    expect(p.orgReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 99 }) })
    );
  });

  it("skips the review query entirely when nothing matched", async () => {
    const p = mockPrisma({ submissions: [] });
    const { reports } = await searchOrgHistory(p, { orgId: 99, term: "nothing" });
    expect(reports).toEqual([]);
    expect(p.orgReview.findMany).not.toHaveBeenCalled();
  });

  it("flags truncated when there are more matches than the cap", async () => {
    // The service asks for MAX_RESULTS + 1 to detect overflow without a second COUNT query.
    const many = Array.from({ length: MAX_RESULTS + 1 }, (_, i) => submissionRow(i + 1, i + 1));
    const p = mockPrisma({ submissions: many });
    const { reports, truncated } = await searchOrgHistory(p, { orgId: 99, term: "a" });
    expect(truncated).toBe(true);
    expect(reports).toHaveLength(MAX_RESULTS); // the probe row is not returned
  });
});

// ---------------------------------------------------------------------------
// Part 2 — route: analyst-only guard + org scoping.
// ---------------------------------------------------------------------------
const submissionFindMany = vi.fn(async () => []);
const orgReviewFindMany = vi.fn(async () => []);
vi.mock("../../db.js", () => ({
  prisma: {
    submission: { findMany: (...a) => submissionFindMany(...a) },
    orgReview: { findMany: (...a) => orgReviewFindMany(...a) },
  },
}));

const { searchRouter } = await import("./search.routes.js");

const appAs = (user) => {
  const app = express();
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/search", searchRouter);
  return app;
}

beforeEach(() => { submissionFindMany.mockClear(); orgReviewFindMany.mockClear(); });

describe("GET /api/search (route)", () => {
  it("403 for a member — and never runs the query", async () => {
    const res = await request(appAs({ id: 2, role: "member", orgId: 99 })).get("/api/search?q=paypal");
    expect(res.status).toBe(403);
    expect(submissionFindMany).not.toHaveBeenCalled();
  });

  it("403 for an individual", async () => {
    const res = await request(appAs({ id: 3, role: "individual", orgId: null })).get("/api/search?q=paypal");
    expect(res.status).toBe(403);
  });

  it("400 when ?q= is missing", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 99 })).get("/api/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/search term/i);
    expect(submissionFindMany).not.toHaveBeenCalled();
  });

  it("400 for a one-character term (too broad to be useful)", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 99 })).get("/api/search?q=a");
    expect(res.status).toBe(400);
  });

  it("200 for an analyst — scoped to their org, echoing the trimmed term", async () => {
    const res = await request(appAs({ id: 7, role: "analyst", orgId: 99 })).get("/api/search?q=%20paypal%20");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reports: [], query: "paypal", truncated: false });
    expect(submissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 99 }) })
    );
  });

  it("an analyst can never search another org's history", async () => {
    await request(appAs({ id: 7, role: "analyst", orgId: 42 })).get("/api/search?q=paypal");
    const where = submissionFindMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(42); // their own org, taken from the verified session — not the query
  });
});
