import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM so we can feed answerNlpQuery a controlled spec.
const chatJSON = vi.fn();
vi.mock("../../services/llm.js", () => ({ chatJSON: (...a) => chatJSON(...a) }));

const { validateSpec, runNlpQuery, answerNlpQuery } = await import("./nlpQuery.service.js");

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
  const findMany = vi.fn();
  const prisma = { indicator: { findMany: (...a) => findMany(...a) } };
  beforeEach(() => findMany.mockReset());

  it("passes a structured where (whitelisted columns only) to Prisma, never raw SQL", async () => {
    findMany.mockResolvedValue([]);
    const spec = validateSpec({ chart: "count", filters: [{ field: "score", op: "lt", value: 35 }], verdictBucket: "dangerous" });
    await runNlpQuery(prisma, spec);
    const arg = findMany.mock.calls[0][0];
    // where is an object of column → { op: value }, i.e. Prisma-parameterized
    expect(arg.where.aiScore).toBeDefined();
    expect(typeof arg.where.aiScore).toBe("object");
    expect(arg.take).toBeLessThanOrEqual(1000); // safety cap present
  });

  it("groups rows by verdict bucket for a bar chart", async () => {
    findMany.mockResolvedValue([{ aiScore: 90 }, { aiScore: 80 }, { aiScore: 10 }]);
    const spec = validateSpec({ chart: "bar", groupBy: "verdict", filters: [] });
    const { data, chartSpec } = await runNlpQuery(prisma, spec);
    expect(chartSpec.type).toBe("bar");
    const safe = data.find((d) => d.label === "safe");
    expect(safe.value).toBe(2);
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
