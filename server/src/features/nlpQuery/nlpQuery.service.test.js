import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM. chatText backs the report-classifier + the SQL planner; chatJSON backs the legacy
// catalog plan path (still used by validatePlan tests). The report BUILDERS are exercised via
// runNlpQuery with a mock prisma; the SQL engine is mocked here (its own guard/executor have
// dedicated suites) so these tests focus on answerNlpQuery's routing.
const chatJSON = vi.fn();
const chatText = vi.fn();
vi.mock("../../services/llm.js", () => ({ chatJSON: (...a) => chatJSON(...a), chatText: (...a) => chatText(...a) }));

// Mock the SQL engine so answerNlpQuery routing can be tested without a live DB. The real SQL
// path is covered by sqlGuard.test.js (adversarial) + live E2E.
const answerWithSql = vi.fn();
const formatRows = vi.fn();
vi.mock("./sqlPlanner.js", () => ({ answerWithSql: (...a) => answerWithSql(...a), formatRows: (...a) => formatRows(...a) }));

const { validatePlan, runNlpQuery, answerNlpQuery } = await import("./nlpQuery.service.js");

const ORG_ID = 7;
const ORG_INDICATORS = [11, 12, 13];
const analyst = (orgId = ORG_ID) => ({ orgId, userId: 1, role: "analyst" });
const member = (orgId = ORG_ID, userId = 2) => ({ orgId, userId, role: "member" });

// Mock prisma. submission.findMany with `distinct` answers the allowlist lookup (which indicators
// may this caller see); other calls return the row fixtures under test.
const mockPrisma = ({ indicators = [], submissions = [], orgReviews = [], campaigns = [] } = {}) => ({
  indicator: { findMany: vi.fn().mockResolvedValue(indicators) },
  submission: {
    findMany: vi.fn(({ distinct } = {}) =>
      Promise.resolve(distinct ? ORG_INDICATORS.map((id) => ({ indicatorId: id })) : submissions)
    ),
    groupBy: vi.fn().mockResolvedValue([]),
  },
  orgReview: { findMany: vi.fn().mockResolvedValue(orgReviews) },
  campaign: { findMany: vi.fn().mockResolvedValue(campaigns) },
});

// A submission fixture joined with its indicator, like buildCount selects.
const sub = (indicatorId, { aiScore = 50, source = "web", aiConfidence = "high", aiTags = [], blacklistHit = false, name = "Anya K.", createdAt = new Date() } = {}) => ({
  indicatorId, createdAt, source,
  user: { name, email: `${name}@x.com` },
  indicator: { aiTitle: `t${indicatorId}`, domain: `d${indicatorId}.com`, aiScore, aiTags, blacklistHit, aiConfidence },
});

beforeEach(() => {
  chatJSON.mockReset();
  chatText.mockReset();
  answerWithSql.mockReset();
  formatRows.mockReset();
});

// ── The security gate: validatePlan rejects anything not in the catalog ─────────────────────
describe("validatePlan — the catalog is the whitelist", () => {
  it("accepts a well-formed count plan and normalizes its filters", () => {
    const plan = validatePlan({ metric: "count", filters: [{ field: "verdict", op: "eq", value: "dangerous" }], groupBy: null }, "analyst");
    expect(plan.kind).toBe("count");
    expect(plan.filters[0]).toMatchObject({ field: "verdict", op: "eq", value: "dangerous" });
  });

  it("REJECTS a metric that isn't in the catalog", () => {
    expect(validatePlan({ metric: "dropTables", filters: [] }, "analyst")).toBeNull();
  });

  it("REJECTS a field that isn't in the catalog (no arbitrary columns)", () => {
    expect(validatePlan({ metric: "count", filters: [{ field: "password", op: "eq", value: "x" }] }, "analyst")).toBeNull();
    expect(validatePlan({ metric: "count", filters: [{ field: "email", op: "eq", value: "x" }] }, "analyst")).toBeNull();
  });

  it("REJECTS an operator not allowed for the field", () => {
    // blacklisted only allows eq; a range op must be rejected.
    expect(validatePlan({ metric: "count", filters: [{ field: "blacklisted", op: "gte", value: true }] }, "analyst")).toBeNull();
  });

  it("REJECTS a bad enum value but accepts a valid one (case-insensitive)", () => {
    expect(validatePlan({ metric: "count", filters: [{ field: "verdict", op: "eq", value: "scary" }] }, "analyst")).toBeNull();
    const ok = validatePlan({ metric: "count", filters: [{ field: "confidence", op: "eq", value: "LOW" }] }, "analyst");
    expect(ok.filters[0].value).toBe("low"); // normalized to the catalog's casing
  });

  it("coerces number + date values and rejects junk", () => {
    const ok = validatePlan({ metric: "count", filters: [{ field: "score", op: "lt", value: "35" }] }, "analyst");
    expect(ok.filters[0].value).toBe(35);
    expect(validatePlan({ metric: "count", filters: [{ field: "score", op: "lt", value: "abc" }] }, "analyst")).toBeNull();
    expect(validatePlan({ metric: "count", filters: [{ field: "reportedAt", op: "gte", value: "not-a-date" }] }, "analyst")).toBeNull();
  });

  it("returns null for the model's honest 'unanswerable' escape", () => {
    expect(validatePlan({ unanswerable: true, reason: "off-topic" }, "analyst")).toBeNull();
    expect(validatePlan(null, "analyst")).toBeNull();
  });

  it("drops an invalid group-by instead of trusting it", () => {
    // 'score' is not in count's groupableBy list → rejected (returns null, the whole plan fails).
    expect(validatePlan({ metric: "count", filters: [], groupBy: "score" }, "analyst")).toBeNull();
    // a valid group-by is kept.
    expect(validatePlan({ metric: "count", filters: [], groupBy: "verdict" }, "analyst").groupBy).toBe("verdict");
  });

  // ── Role gate: analyst-only fields/metrics are invisible AND unusable to members ──
  it("REJECTS an analyst-only field (reporter) when the caller is a member", () => {
    expect(validatePlan({ metric: "count", filters: [{ field: "reporter", op: "eq", value: "Anya" }] }, "member")).toBeNull();
    // …but allows it for an analyst.
    expect(validatePlan({ metric: "count", filters: [{ field: "reporter", op: "eq", value: "Anya" }] }, "analyst")).not.toBeNull();
  });

  it("REJECTS an analyst-only metric (campaignTable) when the caller is a member", () => {
    expect(validatePlan({ metric: "campaignTable" }, "member")).toBeNull();
    expect(validatePlan({ metric: "campaignTable" }, "analyst").report).toBe("campaigns");
  });

  it("REJECTS grouping by an analyst-only field as a member", () => {
    expect(validatePlan({ metric: "count", filters: [], groupBy: "reporter" }, "member")).toBeNull();
  });
});

// ── buildCount: filters + group-by translate to a scoped, parameterized query ───────────────
describe("runNlpQuery — count builder", () => {
  it("counts unique links + keeps the report count, scoped to the org's visible indicators", async () => {
    const prisma = mockPrisma({ submissions: [
      sub(11, { aiScore: 10 }), sub(11, { aiScore: 10 }), sub(12, { aiScore: 20 }),
    ]});
    const plan = validatePlan({ metric: "count", filters: [{ field: "verdict", op: "eq", value: "dangerous" }] }, "analyst");
    const { data, chartSpec } = await runNlpQuery(prisma, plan, analyst());

    expect(chartSpec.type).toBe("bucketCount");
    expect(chartSpec.total).toBe(2);       // two unique links (11, 12)
    expect(chartSpec.reportTotal).toBe(3); // reported three times between them
    // The submission query is fenced to the org + its visible indicator set + the verdict range.
    const call = prisma.submission.findMany.mock.calls.find(([a]) => a.select?.indicator);
    expect(call[0].where.orgId).toBe(ORG_ID);
    expect(call[0].where.indicatorId).toEqual({ in: ORG_INDICATORS });
    expect(call[0].where.indicator.aiScore).toMatchObject({ lt: 35 });
  });

  it("translates 'eq' to Prisma 'equals' for a scalar column (channel/source)", async () => {
    const prisma = mockPrisma({ submissions: [sub(11, { source: "email" })] });
    const plan = validatePlan({ metric: "count", filters: [{ field: "channel", op: "eq", value: "email" }] }, "analyst");
    await runNlpQuery(prisma, plan, analyst());
    const call = prisma.submission.findMany.mock.calls.find(([a]) => a.select?.indicator);
    // source is a submission column → equals, not the raw "eq" (which Prisma rejects).
    expect(call[0].where.source).toEqual({ equals: "email" });
  });

  it("matches an attack-type tag via array_contains on the indicator", async () => {
    const prisma = mockPrisma({ submissions: [sub(11, { aiTags: ["Credential phishing"] })] });
    const plan = validatePlan({ metric: "count", filters: [{ field: "attackType", op: "eq", value: "Credential phishing" }] }, "analyst");
    await runNlpQuery(prisma, plan, analyst());
    const call = prisma.submission.findMany.mock.calls.find(([a]) => a.select?.indicator);
    expect(call[0].where.indicator.aiTags).toEqual({ array_contains: "Credential phishing" });
  });

  it("group-by verdict returns a labelled breakdown (with 'suspicious', not the internal 'review')", async () => {
    const prisma = mockPrisma({ submissions: [
      sub(11, { aiScore: 90 }), sub(12, { aiScore: 50 }), sub(13, { aiScore: 10 }),
    ]});
    const plan = validatePlan({ metric: "count", filters: [], groupBy: "verdict" }, "analyst");
    const { data, chartSpec } = await runNlpQuery(prisma, plan, analyst());
    expect(chartSpec.type).toBe("bar");
    const labels = data.map((d) => d.label);
    expect(labels).toContain("safe");
    expect(labels).toContain("suspicious"); // NOT "review"
    expect(labels).toContain("dangerous");
  });

  it("resolves a review-status filter through OrgReview, scoped to the visible set", async () => {
    const prisma = mockPrisma({ submissions: [sub(12)] });
    prisma.orgReview.findMany = vi.fn().mockResolvedValue([{ indicatorId: 12 }]);
    const plan = validatePlan({ metric: "count", filters: [{ field: "reviewStatus", op: "eq", value: "pending review" }] }, "analyst");
    const { chartSpec } = await runNlpQuery(prisma, plan, analyst());
    // It first narrows to indicators with that status, within the org's visible set.
    expect(prisma.orgReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: ORG_ID, reviewStatus: "pending review", indicatorId: { in: ORG_INDICATORS } }) })
    );
    expect(chartSpec.title).toMatch(/pending review/i);
  });
});

// ── Member privacy gate: the visible-indicator allowlist narrows every count ────────────────
describe("member scope — a member never counts a teammate's un-shared links", () => {
  const memberPrisma = () => ({
    indicator: { findMany: vi.fn().mockResolvedValue([]) },
    submission: {
      findMany: vi.fn(({ distinct, where, select } = {}) => {
        if (distinct && where?.userId) return Promise.resolve([{ indicatorId: 21 }, { indicatorId: 22 }]); // own
        if (select?.indicator) return Promise.resolve([]); // the count query itself
        return Promise.resolve([]);
      }),
    },
    orgReview: { findMany: vi.fn().mockResolvedValue([{ indicatorId: 22 }, { indicatorId: 30 }]) }, // shared
    campaign: { findMany: vi.fn() },
  });

  it("fences a member's count query to own ∪ shared indicators [21,22,30]", async () => {
    const prisma = memberPrisma();
    const plan = validatePlan({ metric: "count", filters: [{ field: "verdict", op: "eq", value: "dangerous" }] }, "member");
    await runNlpQuery(prisma, plan, member());
    const call = prisma.submission.findMany.mock.calls.find(([a]) => a.select?.indicator);
    expect(call[0].where.indicatorId.in.sort()).toEqual([21, 22, 30]);
  });

  it("returns an empty (correctly-shaped) result when the member has no visible indicators", async () => {
    const prisma = memberPrisma();
    prisma.submission.findMany = vi.fn(() => Promise.resolve([])); // no own submissions
    prisma.orgReview.findMany = vi.fn().mockResolvedValue([]);     // nothing shared
    const plan = validatePlan({ metric: "count", filters: [] }, "member");
    const res = await runNlpQuery(prisma, plan, member());
    expect(res.chartSpec.empty).toBe(true);
    expect(res.data).toEqual([]);
  });
});

// ── Report builders still work + org isolation (unchanged behavior, kept from before) ───────
describe("named reports — shapes the client renders, scoped to the org", () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000);

  it("weekly report returns totals + daily bars + findings, scoped by orgId", async () => {
    const prisma = mockPrisma({ submissions: [
      { indicatorId: 11, createdAt: hoursAgo(2), indicator: { aiTitle: "Fake login", domain: "x.co", aiScore: 12, aiTags: ["Credential phishing"] } },
    ]});
    const plan = validatePlan({ metric: "weeklyReport" }, "analyst");
    const { data, chartSpec } = await runNlpQuery(prisma, plan, analyst());
    expect(chartSpec.type).toBe("report");
    expect(chartSpec.title).toBe("Weekly Threat Report");
    expect(data.totals.total).toBe(1);
    const reportCall = prisma.submission.findMany.mock.calls[1][0];
    expect(reportCall.where.orgId).toBe(ORG_ID);
    expect(reportCall.where.indicatorId).toEqual({ in: ORG_INDICATORS });
  });

  it("histogram is scoped to the org's indicators", async () => {
    const prisma = mockPrisma({ indicators: [{ aiScore: 90 }, { aiScore: 10 }] });
    const plan = validatePlan({ metric: "scoreDistribution" }, "analyst");
    await runNlpQuery(prisma, plan, analyst());
    expect(prisma.indicator.findMany.mock.calls[0][0].where.id).toEqual({ in: ORG_INDICATORS });
  });

  it("gives a MEMBER an empty campaigns table (campaigns are analyst-only) — via validatePlan gate", async () => {
    // A member's plan can't even name campaignTable, so validatePlan returns null → fallback.
    expect(validatePlan({ metric: "campaignTable" }, "member")).toBeNull();
  });

  it("an analyst's campaign table is built (role gate lets it through)", async () => {
    const prisma = mockPrisma({
      campaigns: [{ id: 3, name: "MS365 Impersonation", lastSeen: new Date(), orgReviews: [{ indicatorId: 11 }] }],
      orgReviews: [{ campaignId: 3, indicator: { aiScore: 20 } }],
    });
    const plan = validatePlan({ metric: "campaignTable" }, "analyst");
    const { data, chartSpec } = await runNlpQuery(prisma, plan, analyst());
    expect(chartSpec.type).toBe("table");
    expect(data[0].name).toBe("MS365 Impersonation");
  });

  it("no org → empty result, never an unscoped read", async () => {
    const prisma = mockPrisma({ indicators: [{ aiScore: 10 }] });
    const res = await runNlpQuery(prisma, validatePlan({ metric: "count", filters: [] }, "analyst"), { orgId: null, userId: 1, role: "analyst" });
    expect(res.chartSpec.empty).toBe(true);
    expect(prisma.indicator.findMany).not.toHaveBeenCalled();
  });
});

// ── answerNlpQuery routing: classifier → (named report builder | SQL engine) ────────────────
// The classifier (chatText) decides between the 5 rich named reports and the flexible SQL engine.
// Report builders run via mock prisma; the SQL engine is mocked (its guard/executor are tested
// separately + live). These assert the ROUTING + honest failure handling.
describe("answerNlpQuery — two-engine routing", () => {
  const prisma = () => mockPrisma({ submissions: [sub(11, { aiScore: 10 })] });

  it("routes a data question to the SQL engine and returns its formatted result", async () => {
    chatText.mockResolvedValueOnce("query"); // classifier → not a named report
    answerWithSql.mockResolvedValue({ rows: [{ n: 5 }], sql: "SELECT count(*) ..." });
    formatRows.mockReturnValue({ data: [{ label: "Total", value: 5 }], chartSpec: { type: "count", title: "How many dangerous links" } });

    const res = await answerNlpQuery(prisma(), "how many dangerous links from email this week", analyst());
    expect(answerWithSql).toHaveBeenCalledWith("how many dangerous links from email this week", analyst());
    expect(res.chartSpec.type).toBe("count");
    expect(res.data[0].value).toBe(5);
  });

  it("routes a named-report question to its builder (no SQL engine call)", async () => {
    chatText.mockResolvedValueOnce("weekly"); // classifier → the weekly report
    const res = await answerNlpQuery(prisma(), "give me this week's summary", analyst());
    expect(answerWithSql).not.toHaveBeenCalled();
    expect(res.chartSpec.type).toBe("report");
    expect(res.chartSpec.title).toBe("Weekly Threat Report");
  });

  it("gives an honest fallback when the SQL engine can't build/guard a query", async () => {
    chatText.mockResolvedValueOnce("query");
    answerWithSql.mockResolvedValue({ error: "reject", reason: "only the v_reports view may be queried" });
    const res = await answerNlpQuery(prisma(), "something the guard rejects", analyst());
    expect(res.fallback).toBeDefined();
    expect(res.data).toBeUndefined();
  });

  it("honors the classifier's 'unanswerable' with a helpful message (no engine call)", async () => {
    chatText.mockResolvedValueOnce("unanswerable");
    const res = await answerNlpQuery(prisma(), "what's the weather", analyst());
    expect(answerWithSql).not.toHaveBeenCalled();
    expect(res.fallback).toMatch(/threat reports/i);
  });

  it("returns a clean 'unavailable' message (not a 500) when the classifier LLM throws", async () => {
    chatText.mockRejectedValueOnce(new Error("gateway 502"));
    const res = await answerNlpQuery(prisma(), "how many dangerous links", analyst());
    expect(res.fallback).toMatch(/unavailable/i);
  });

  it("denies a member the analyst-only campaigns report (routes to fallback, not the builder)", async () => {
    chatText.mockResolvedValueOnce("campaigns"); // even if the classifier says campaigns…
    const res = await answerNlpQuery(prisma(), "show active campaigns", member());
    // …a member can't have it → honest fallback, campaign builder never runs.
    expect(res.fallback).toBeDefined();
  });
});
