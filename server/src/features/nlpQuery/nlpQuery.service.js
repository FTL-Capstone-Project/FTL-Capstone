// ── feature: nlp-query · owner: David ──
// AI Feature B: an analyst asks the threat history in plain English ("how many dangerous
// links this week?", "top impersonated brands"), and we turn it into a CHART.
//
// SECURITY MODEL (the whole point): the LLM never touches SQL and never picks a raw field.
// It proposes a STRUCTURED spec constrained to a WHITELIST. We then validate every field,
// operator, and value against that whitelist and build a PARAMETERIZED Prisma query. Model
// output that fails validation is rejected → the "try rephrasing" fallback. This is the same
// discipline as the verdict pipeline: the AI narrates/proposes, code makes the real decision.
import { chatJSON } from "../../services/llm.js";

// ── The whitelist: the ONLY fields/operators/values the analyst can query. ──
// Each field maps to a real Indicator column and declares its type + allowed operators.
// Nothing outside this table can ever reach the query.
const FIELDS = {
  score:      { column: "aiScore",       type: "number", ops: ["gte", "lte", "gt", "lt", "eq"] },
  domainAge:  { column: "domainAgeDays", type: "number", ops: ["gte", "lte", "gt", "lt", "eq"] },
  blacklisted:{ column: "blacklistHit",  type: "boolean", ops: ["eq"] },
  status:     { column: "status",        type: "enum",   ops: ["eq"], values: ["pending", "scanning", "done", "error"] },
  reviewStatus:{ column: "globalReviewStatus", type: "enum", ops: ["eq"], values: ["pending review", "confirmed safe", "confirmed dangerous"] },
  createdAt:  { column: "createdAt",     type: "date",   ops: ["gte", "lte"] }, // "since"/"before"
};

// Verdict buckets → score ranges, so "dangerous"/"safe" questions map to a numeric filter
// (matches scoreBucket: ≥70 safe, ≥35 review, else dangerous).
const BUCKET_RANGES = {
  safe:      { gte: 70 },
  review:    { gte: 35, lt: 70 },
  dangerous: { lt: 35 },
};

// Chart types we can render (the client maps these to Recharts). Whitelisted too.
const CHART_TYPES = ["bar", "line", "pie", "count"];

// Group-by dimensions the analyst can slice by (safe columns only).
const GROUP_BY = {
  verdict:     "aiScore",     // bucketed into safe/review/dangerous
  status:      "status",
  reviewStatus:"globalReviewStatus",
  day:         "createdAt",   // grouped by calendar day
};

// The JSON contract we force the LLM to return. Kept tight so validation is simple.
const SYSTEM = `You translate an analyst's plain-English question about a threat-history database
into a STRICT JSON query spec. You do NOT write SQL. Reply with ONLY minified JSON:
{"chart":"bar|line|pie|count","groupBy":"verdict|status|reviewStatus|day|null",
"filters":[{"field":"score|domainAge|blacklisted|status|reviewStatus|createdAt","op":"gte|lte|gt|lt|eq","value":<number|boolean|string>}],
"verdictBucket":"safe|review|dangerous|null","title":"<short chart title>"}
Rules: use ONLY those field/op/chart/groupBy values. For "dangerous/suspicious/safe" questions set
verdictBucket. For "this week/last 7 days" add a createdAt gte filter with an ISO date. If the
question can't be expressed with these fields, reply {"unmappable":true}. No prose, no markdown.`;

// Validate the LLM's spec against the whitelist. Returns a safe, normalized spec or null.
// null → caller returns the "try rephrasing" fallback. This is the security gate.
export const validateSpec = (spec) => {
  if (!spec || typeof spec !== "object" || spec.unmappable) return null;
  if (!CHART_TYPES.includes(spec.chart)) return null;

  const groupBy = spec.groupBy && GROUP_BY[spec.groupBy] ? spec.groupBy : null;

  const rawFilters = Array.isArray(spec.filters) ? spec.filters : [];
  const filters = [];
  for (const f of rawFilters) {
    const def = FIELDS[f?.field];
    if (!def) return null;                       // unknown field → reject the whole thing
    if (!def.ops.includes(f.op)) return null;    // disallowed operator → reject
    // Type-check + coerce the value; reject anything that doesn't fit the declared type.
    let value = f.value;
    if (def.type === "number") { value = Number(value); if (!Number.isFinite(value)) return null; }
    else if (def.type === "boolean") { if (typeof value !== "boolean") return null; }
    else if (def.type === "enum") { if (!def.values.includes(value)) return null; }
    else if (def.type === "date") { const d = new Date(value); if (isNaN(d.getTime())) return null; value = d; }
    else return null;
    filters.push({ column: def.column, op: f.op, value });
  }

  const verdictBucket = ["safe", "review", "dangerous"].includes(spec.verdictBucket) ? spec.verdictBucket : null;
  const title = typeof spec.title === "string" && spec.title.trim() ? spec.title.trim().slice(0, 80) : "Threat query";
  return { chart: spec.chart, groupBy, filters, verdictBucket, title };
};

// Build a PARAMETERIZED Prisma `where` from the validated spec. Only whitelisted columns
// and operator keys ever appear here — values are passed as Prisma args (never interpolated).
const buildWhere = (spec) => {
  const where = {};
  for (const f of spec.filters) {
    where[f.column] = { ...(where[f.column] || {}), [f.op]: f.value };
  }
  if (spec.verdictBucket) {
    where.aiScore = { ...(where.aiScore || {}), ...BUCKET_RANGES[spec.verdictBucket] };
  }
  return where;
};

// Bucket a raw safety score into the verdict label (mirrors scoreBucket).
const bucketOf = (score) => (score == null ? "review" : score >= 70 ? "safe" : score >= 35 ? "review" : "dangerous");

// Run the validated query and shape the result into { data, chartSpec } for the client.
// `prisma` is passed in (same testable pattern as the other services).
export const runNlpQuery = async (prisma, spec) => {
  const where = buildWhere(spec);
  const rows = await prisma.indicator.findMany({
    where,
    select: { aiScore: true, status: true, globalReviewStatus: true, createdAt: true, domain: true },
    take: 1000, // safety cap
  });

  // "count" → a single number. Otherwise group by the chosen dimension into chart data.
  if (spec.chart === "count" || !spec.groupBy) {
    return { data: [{ label: "Total", value: rows.length }], chartSpec: { type: "count", title: spec.title } };
  }

  const counts = {};
  for (const r of rows) {
    let key;
    if (spec.groupBy === "verdict") key = bucketOf(r.aiScore);
    else if (spec.groupBy === "status") key = r.status ?? "unknown";
    else if (spec.groupBy === "reviewStatus") key = r.globalReviewStatus ?? "not reviewed";
    else if (spec.groupBy === "day") key = new Date(r.createdAt).toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  }
  const data = Object.entries(counts).map(([label, value]) => ({ label, value }));
  return { data, chartSpec: { type: spec.chart, title: spec.title, groupBy: spec.groupBy } };
};

// Top-level: question → validated spec → data. Returns { data, chartSpec } or a fallback.
export const answerNlpQuery = async (prisma, question) => {
  const raw = await chatJSON({ system: SYSTEM, user: `Question: ${question}\n\nReturn the JSON spec.`, maxTokens: 300, temperature: 0 });
  const spec = validateSpec(raw);
  if (!spec) {
    return { fallback: "I couldn't turn that into a chart. Try rephrasing — e.g. \"how many dangerous links this week?\" or \"break down checks by verdict\"." };
  }
  const result = await runNlpQuery(prisma, spec);
  return result;
};
