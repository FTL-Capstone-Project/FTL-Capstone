import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM so we can feed answerNlpQuery a controlled spec.
const chatJSON = vi.fn();
vi.mock("../../services/llm.js", () => ({ chatJSON: (...a) => chatJSON(...a) }));

const { validateSpec, matchReport, runNlpQuery, answerNlpQuery } = await import("./nlpQuery.service.js");

// Every read is org-scoped now, so a mock prisma needs BOTH tables: submission.findMany answers
// "which indicators does this org own?" and indicator.findMany is the actual query under test.
// ORG_ID + ORG_INDICATORS are the fixture the isolation assertions check against.
const ORG_ID = 7;
const ORG_INDICATORS = [11, 12, 13];

const mockPrisma = ({ indicators = [], submissions = [], orgReviews = [], campaigns = [] } = {}) => {
  const submissionFindMany = vi.fn(({ distinct } = {}) =>
    // The first call resolves the org's indicator ids; later calls return the row fixtures.
    Promise.resolve(distinct ? ORG_INDICATORS.map((id) => ({ indicatorId: id })) : submissions)
  );
  return {
    indicator: { findMany: vi.fn().mockResolvedValue(indicators) },
    submission: { findMany: submissionFindMany, groupBy: vi.fn().mockResolvedValue([]) },
    orgReview: { findMany: vi.fn().mockResolvedValue(orgReviews) },
    campaign: { findMany: vi.fn().mockResolvedValue(campaigns) },
  };
};

describe("validateSpec — the security whitelist", () => {
  it("accepts a valid spec and normalizes it", () => {
    const s = validateSpec({ chart: "bar", groupBy: "verdict", filters: [{ field: "score", op: "gte", value: 70 }], title: "Safe links" });
    expect(s).not.toBeNull();
    expect(s.chart).toBe("bar");
    expect(s.filters[0]).toEqual({ column: "aiScore", op: "gte", value: 70 });
  });

  it("REJECTS a field that isn't whitelisted (no arbitrary columns)", () => {
    // 'password' / 'email' etc. must never pass through to a query.
    expect(validateSpec({ chart: "bar", filters: [{ field: "password", op: "eq", value: "x" }] })).toBeNull();
    expect(validateSpec({ chart: "bar", filters: [{ field: "canonicalKey", op: "eq", value: "x" }] })).toBeNull();
  });

  it("REJECTS an operator not allowed for the field", () => {
    // 'blacklisted' only allows eq; 'contains' (a string op) must be rejected.
    expect(validateSpec({ chart: "bar", filters: [{ field: "blacklisted", op: "contains", value: true }] })).toBeNull();
  });

  it("REJECTS a value of the wrong type / bad enum", () => {
    expect(validateSpec({ chart: "bar", filters: [{ field: "score", op: "gte", value: "not-a-number" }] })).toBeNull();
    expect(validateSpec({ chart: "bar", filters: [{ field: "status", op: "eq", value: "hacked" }] })).toBeNull();
  });

  it("REJECTS an unknown chart type", () => {
    expect(validateSpec({ chart: "explode", filters: [] })).toBeNull();
  });

  it("returns null for an unmappable question", () => {
    expect(validateSpec({ unmappable: true })).toBeNull();
    expect(validateSpec(null)).toBeNull();
  });

  it("drops an unknown groupBy to null instead of trusting it", () => {
    const s = validateSpec({ chart: "bar", groupBy: "ssn", filters: [] });
    expect(s.groupBy).toBeNull();
  });
});

describe("runNlpQuery — parameterized query + shaping", () => {
  it("passes a structured where (whitelisted columns only) to Prisma, never raw SQL", async () => {
    const prisma = mockPrisma();
    const spec = validateSpec({ chart: "count", filters: [{ field: "score", op: "lt", value: 35 }], verdictBucket: "dangerous" });
    await runNlpQuery(prisma, spec, ORG_ID);
    const arg = prisma.indicator.findMany.mock.calls[0][0];
    // where is an object of column → { op: value }, i.e. Prisma-parameterized
    expect(arg.where.aiScore).toBeDefined();
    expect(typeof arg.where.aiScore).toBe("object");
    expect(arg.take).toBeLessThanOrEqual(1000); // safety cap present
  });

  it("groups rows by verdict bucket for a bar chart", async () => {
    const prisma = mockPrisma({ indicators: [{ aiScore: 90 }, { aiScore: 80 }, { aiScore: 10 }] });
    const spec = validateSpec({ chart: "bar", groupBy: "verdict", filters: [] });
    const { data, chartSpec } = await runNlpQuery(prisma, spec, ORG_ID);
    expect(chartSpec.type).toBe("bar");
    const safe = data.find((d) => d.label === "safe");
    expect(safe.value).toBe(2);
  });
});

describe("org isolation — story #12 (an analyst never counts another org's links)", () => {
  it("narrows the generic query to the org's own indicator ids", async () => {
    const prisma = mockPrisma({ indicators: [] });
    await runNlpQuery(prisma, validateSpec({ chart: "count", filters: [] }), ORG_ID);
    // The org lookup asks submissions for THIS orgId...
    expect(prisma.submission.findMany.mock.calls[0][0].where).toEqual({ orgId: ORG_ID });
    // ...and the indicator query is fenced to the ids it returned.
    expect(prisma.indicator.findMany.mock.calls[0][0].where.id).toEqual({ in: ORG_INDICATORS });
  });

  it("returns an empty result WITHOUT querying when the analyst has no org", async () => {
    const prisma = mockPrisma({ indicators: [{ aiScore: 10 }] });
    const res = await runNlpQuery(prisma, validateSpec({ chart: "count", filters: [] }), null);
    expect(res.data).toEqual([{ label: "Total", value: 0 }]);
    expect(res.chartSpec.empty).toBe(true);
    // The critical assertion: no unscoped read happened at all.
    expect(prisma.indicator.findMany).not.toHaveBeenCalled();
  });

  it("scopes the histogram to the org's indicators too", async () => {
    const prisma = mockPrisma({ indicators: [{ aiScore: 90 }] });
    await runNlpQuery(prisma, validateSpec({ report: "distribution" }), ORG_ID);
    expect(prisma.indicator.findMany.mock.calls[0][0].where.id).toEqual({ in: ORG_INDICATORS });
  });

  it("scopes the heatmap and weekly report by orgId", async () => {
    for (const report of ["heatmap", "weekly"]) {
      const prisma = mockPrisma();
      await runNlpQuery(prisma, validateSpec({ report }), ORG_ID);
      // Call 0 is the id lookup; call 1 is the report's own read — both carry orgId.
      const reportCall = prisma.submission.findMany.mock.calls[1][0];
      expect(reportCall.where.orgId).toBe(ORG_ID);
    }
  });
});

describe("matchReport — the no-LLM fast path for the 5 wireframed reports", () => {
  it("maps each canned prompt chip to its report", () => {
    expect(matchReport("Generate a weekly threat report").report).toBe("weekly");
    expect(matchReport("When are threats most commonly being submitted?").report).toBe("heatmap");
    expect(matchReport("Show me how different attack types have trended over the last 90 days").report).toBe("trend");
    expect(matchReport("Give me a breakdown of the active threat campaigns").report).toBe("campaigns");
    expect(matchReport("Show me the score distribution across all submissions").report).toBe("distribution");
  });

  it("derives the chart type from OUR table, not from the question", () => {
    expect(matchReport("show the heatmap").chart).toBe("heatmap");
    expect(matchReport("active campaigns").chart).toBe("table");
    expect(matchReport("score distribution").chart).toBe("histogram");
  });

  it("returns null for anything it doesn't recognise (falls through to the LLM)", () => {
    expect(matchReport("how many blacklisted domains?")).toBeNull();
    expect(matchReport("")).toBeNull();
    expect(matchReport(undefined)).toBeNull();
  });

  // The Insights page advertises "How many dangerous links this week?" as a prompt chip, so it
  // must NEVER depend on the LLM answering well — it used to fall through and could come back as
  // the "try rephrasing" fallback (which absurdly suggested the very question just asked).
  it("answers the 'how many <verdict> links this week' chip with no LLM call", () => {
    const spec = matchReport("How many dangerous links this week?");
    expect(spec.chart).toBe("count");
    expect(spec.verdictBucket).toBe("dangerous");
    expect(spec.title).toBe("Dangerous links this week");
    // A createdAt >= filter scopes it to the last 7 days, same window as the weekly report.
    expect(spec.filters).toHaveLength(1);
    expect(spec.filters[0]).toMatchObject({ column: "createdAt", op: "gte" });
    expect(spec.filters[0].value).toBeInstanceOf(Date);
  });

  it("maps each verdict word to the right internal bucket", () => {
    expect(matchReport("how many safe links this week").verdictBucket).toBe("safe");
    // "suspicious" is the UI's wording for the internal "review" band.
    expect(matchReport("how many suspicious links this week").verdictBucket).toBe("review");
  });

  it("drops the date filter when the question isn't scoped to a week", () => {
    const spec = matchReport("how many dangerous links");
    expect(spec.filters).toEqual([]);
    expect(spec.title).toBe("Dangerous links");
  });

  it("still prefers a named report when the question mentions both", () => {
    // "weekly report" wins over the "how many" count path — reports are checked first.
    expect(matchReport("how many dangerous links are in the weekly report").report).toBe("weekly");
  });

  it("leaves questions with filters it can't express to the LLM", () => {
    // No verdict word → not a bucket count, so the model still gets its chance.
    expect(matchReport("how many links did marcus submit")).toBeNull();
  });
});

describe("bucket count — the number PLUS the links behind it", () => {
  // The org reported the same dangerous link twice and another one once.
  const submissions = [
    {
      indicatorId: 7, createdAt: new Date("2026-07-26T09:00:00Z"),
      user: { name: "Anya K.", email: "anya@x.com" },
      indicator: { aiTitle: "Fake Microsoft 365 sign-in", domain: "ms365-verify.com", aiScore: 8, aiTags: ["Credential phishing"], blacklistHit: true },
    },
    {
      indicatorId: 9, createdAt: new Date("2026-07-25T09:00:00Z"),
      user: { name: "Diego R.", email: "diego@x.com" },
      indicator: { aiTitle: "Fake payroll form", domain: "payroll-portal.com", aiScore: 18, aiTags: ["Business email compromise"], blacklistHit: false },
    },
    {
      indicatorId: 7, createdAt: new Date("2026-07-24T09:00:00Z"),
      user: { name: "Sarah L.", email: "sarah@x.com" },
      indicator: { aiTitle: "Fake Microsoft 365 sign-in", domain: "ms365-verify.com", aiScore: 8, aiTags: ["Credential phishing"], blacklistHit: true },
    },
  ];
  const mockPrisma = {
    submission: {
      findMany: vi.fn(async ({ select }) => (select?.indicatorId && !select?.indicator
        ? [{ indicatorId: 7 }, { indicatorId: 9 }]   // orgIndicatorIds()
        : submissions)),
    },
  };

  it("returns one row per link, most dangerous first, with the report count", async () => {
    const spec = matchReport("How many dangerous links this week?");
    const { data, chartSpec } = await runNlpQuery(mockPrisma, spec, 5);

    expect(chartSpec.type).toBe("bucketCount");
    expect(chartSpec.total).toBe(2);        // two distinct links…
    expect(chartSpec.reportTotal).toBe(3);  // …reported three times between them
    expect(chartSpec.band).toBe("dangerous");

    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      indicatorId: 7, score: 8, band: "dangerous", tag: "Credential phishing",
      blacklisted: true, reportCount: 2,
    });
    // Newest report wins the row's attribution (submissions come back newest-first).
    expect(data[0].reportedBy).toBe("Anya K.");
    expect(data[1].score).toBe(18); // 8 before 18 — lowest safety score first
  });

  // The bug this builder fixes: FIELDS.createdAt maps to Indicator.createdAt (when the URL was
  // first seen GLOBALLY by any org), but "this week" means when THIS org reported it.
  it("scopes 'this week' to the org's SUBMISSION date, not the indicator's global first-seen date", async () => {
    mockPrisma.submission.findMany.mockClear();
    await runNlpQuery(mockPrisma, matchReport("how many dangerous links this week"), 5);

    // The evidence query (the one selecting the indicator) must filter on the submission's own
    // createdAt, and must never put a date filter on the nested indicator.
    const evidenceCall = mockPrisma.submission.findMany.mock.calls
      .map(([args]) => args)
      .find((args) => args.select?.indicator);
    expect(evidenceCall.where.createdAt).toMatchObject({ gte: expect.any(Date) });
    expect(evidenceCall.where.indicator).toEqual({ aiScore: { lt: 35 } });
    expect(evidenceCall.where.indicator.createdAt).toBeUndefined();
    expect(evidenceCall.where.orgId).toBe(5); // story #12 isolation
  });

  it("omits the date filter when the question isn't week-scoped", async () => {
    mockPrisma.submission.findMany.mockClear();
    await runNlpQuery(mockPrisma, matchReport("how many dangerous links"), 5);
    const evidenceCall = mockPrisma.submission.findMany.mock.calls
      .map(([args]) => args)
      .find((args) => args.select?.indicator);
    expect(evidenceCall.where.createdAt).toBeUndefined();
  });
});

describe("named reports — the whitelist holds", () => {
  it("accepts the 5 report names and fixes the chart type + title itself", () => {
    const s = validateSpec({ report: "heatmap", chart: "count", title: "ignore me" });
    expect(s.report).toBe("heatmap");
    expect(s.chart).toBe("heatmap");        // derived from REPORTS, not the model's "count"
    expect(s.title).toBe("Submission Activity Heatmap");
  });

  it("REJECTS a report name that isn't whitelisted", () => {
    expect(validateSpec({ report: "all_users" })).toBeNull();
    expect(validateSpec({ report: "../../etc/passwd" })).toBeNull();
  });
});

describe("report builders — data shapes the client renders", () => {
  // Fixed timestamps (not Date.now()) so the buckets a test asserts on never drift.
  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000);

  it("heatmap returns a complete 7×8 grid with a max for the colour ramp", async () => {
    const prisma = mockPrisma({ submissions: [{ createdAt: hoursAgo(1) }, { createdAt: hoursAgo(1) }] });
    const { data, chartSpec } = await runNlpQuery(prisma, validateSpec({ report: "heatmap" }), ORG_ID);
    expect(chartSpec.type).toBe("heatmap");
    expect(data).toHaveLength(56);                  // 7 days × 8 three-hour slots, no gaps
    expect(chartSpec.days).toHaveLength(7);
    expect(chartSpec.slots).toHaveLength(8);
    expect(chartSpec.max).toBe(2);                  // both submissions land in the same cell
    expect(chartSpec.subtitle).toMatch(/UTC/);      // timezone caveat is surfaced
  });

  it("trend returns one series per attack type with computed deltas", async () => {
    const prisma = mockPrisma({
      submissions: [
        { createdAt: hoursAgo(2), indicator: { aiTags: ["Credential phishing"] } },
        { createdAt: hoursAgo(3), indicator: { aiTags: ["Credential phishing"] } },
        { createdAt: hoursAgo(4), indicator: { aiTags: ["Social engineering"] } },
      ],
    });
    const { data, chartSpec } = await runNlpQuery(prisma, validateSpec({ report: "trend" }), ORG_ID);
    expect(chartSpec.type).toBe("trend");
    expect(chartSpec.series).toContain("Credential phishing");
    expect(chartSpec.deltas.every((d) => ["up", "down", "flat"].includes(d.direction))).toBe(true);
    // Every bucket carries every series key, so Recharts draws continuous lines.
    for (const series of chartSpec.series) expect(data[0]).toHaveProperty(series);
  });

  it("histogram buckets scores into 10 bands using scoreBucket's real edges", async () => {
    const prisma = mockPrisma({ indicators: [{ aiScore: 90 }, { aiScore: 95 }, { aiScore: 10 }, { aiScore: 50 }] });
    const { data, chartSpec } = await runNlpQuery(prisma, validateSpec({ report: "distribution" }), ORG_ID);
    expect(data).toHaveLength(10);
    expect(data[9].value).toBe(2);                  // 90 and 95 both sit in the 90–99 bucket
    expect(data[9].band).toBe("safe");
    // Legend labels the REAL thresholds (70/35), not the wireframe's 67/34.
    expect(chartSpec.bands.find((b) => b.band === "safe").label).toBe("Safe (70–100)");
    expect(chartSpec.bands.find((b) => b.band === "safe").count).toBe(2);
  });

  it("campaigns table reuses listCampaigns and adds avgScore + status", async () => {
    const prisma = mockPrisma({
      campaigns: [{ id: 3, name: "Microsoft 365 Impersonation", lastSeen: now, orgReviews: [{ indicatorId: 11 }] }],
      orgReviews: [{ campaignId: 3, indicator: { aiScore: 20 } }],
    });
    const { data, chartSpec } = await runNlpQuery(prisma, validateSpec({ report: "campaigns" }), ORG_ID);
    expect(chartSpec.type).toBe("table");
    expect(data[0].name).toBe("Microsoft 365 Impersonation");
    expect(data[0].avgScore).toBe(20);
    expect(data[0].band).toBe("dangerous");
    expect(data[0].status).toBe("Active");          // dangerous average → Active
  });

  it("weekly report returns totals, daily bars, top threats and COMPUTED findings", async () => {
    const prisma = mockPrisma({
      submissions: [
        { indicatorId: 11, createdAt: hoursAgo(2),  indicator: { aiTitle: "Fake PayPal login", domain: "pypal.co", aiScore: 12, aiTags: ["Credential phishing"] } },
        { indicatorId: 12, createdAt: hoursAgo(30), indicator: { aiTitle: "HR benefits",       domain: "hr.example", aiScore: 91, aiTags: ["Internal comms"] } },
      ],
    });
    const { data, chartSpec } = await runNlpQuery(prisma, validateSpec({ report: "weekly" }), ORG_ID);
    expect(chartSpec.type).toBe("report");
    expect(data.totals.total).toBe(2);
    expect(data.totals.dangerous).toBe(1);
    expect(data.totals.safe).toBe(1);
    expect(data.daily).toHaveLength(7);              // a bar per day, quiet days included
    expect(data.topThreats[0].title).toBe("Fake PayPal login"); // worst score first
    expect(data.findings.length).toBeGreaterThan(0);
    // Findings are computed in code, so every one carries a real direction.
    for (const f of data.findings) expect(["up", "down", "flat"]).toContain(f.direction);
  });

  it("an org with no submissions gets an empty report, not a crash", async () => {
    const prisma = mockPrisma();
    prisma.submission.findMany = vi.fn().mockResolvedValue([]); // no indicators owned
    const res = await runNlpQuery(prisma, validateSpec({ report: "weekly" }), ORG_ID);
    expect(res.chartSpec.empty).toBe(true);
    expect(res.data.totals.total).toBe(0);
  });
});

describe("answerNlpQuery — end to end", () => {
  const prisma = { indicator: { findMany: vi.fn().mockResolvedValue([]) } };
  beforeEach(() => chatJSON.mockReset());

  it("returns a fallback message when the LLM says unmappable", async () => {
    chatJSON.mockResolvedValue({ unmappable: true });
    const res = await answerNlpQuery(prisma, "what's the weather");
    expect(res.fallback).toBeDefined();
    expect(res.data).toBeUndefined();
  });

  it("returns a fallback when the LLM emits a disallowed field (whitelist holds end-to-end)", async () => {
    chatJSON.mockResolvedValue({ chart: "bar", filters: [{ field: "password", op: "eq", value: "x" }] });
    const res = await answerNlpQuery(prisma, "show me passwords");
    expect(res.fallback).toBeDefined();
  });

  it("returns data + chartSpec for a valid question", async () => {
    chatJSON.mockResolvedValue({ chart: "count", groupBy: null, filters: [{ field: "blacklisted", op: "eq", value: true }], title: "Blacklisted" });
    const res = await answerNlpQuery(prisma, "how many blacklisted");
    expect(res.chartSpec).toBeDefined();
    expect(res.fallback).toBeUndefined();
  });
});
