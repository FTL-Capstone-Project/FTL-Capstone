// ── feature: nlp-query · owner: David · LLM-first rearchitecture by Michael ──
// AI Feature B: a user asks their org's threat data in plain English and gets a real answer.
//
// HOW IT WORKS (LLM-first, catalog-driven — NO keyword matching):
//   1. We hand the LLM a CATALOG (catalog.js — the "form"): every metric + field we can answer,
//      each with a rich plain-English description, trimmed to what the caller's role may see.
//   2. The LLM reads the question + catalog and returns a structured PLAN — which metric, which
//      filters, which group-by — in words drawn straight from the catalog. This is the layer that
//      actually understands language, so rewordings ("how many reports were made this week" vs
//      "count of checks in the last 7 days") map to the same plan.
//   3. validatePlan() checks EVERY token in that plan against the catalog (the security gate): an
//      unknown metric/field/op/enum value, or an analyst-only field a member named, is rejected.
//      The LLM proposes; code decides. A rejected/return-nothing plan → an honest message.
//   4. The validated plan runs as a PARAMETERIZED, ORG-SCOPED Prisma query. Nothing the LLM says
//      ever becomes SQL or a raw column.
//
// ORG ISOLATION (story #12) + MEMBER PRIVACY GATE: every read is narrowed to the caller's visible
// indicator set (analyst = whole org; member = own submissions ∪ analyst-shared reviews).
import { chatJSON } from "../../services/llm.js";
import { scoreBucket } from "../../services/verdict.js";
import { listCampaigns } from "../campaigns/campaigns.service.js";
import { isAnalyst } from "../../middleware/roles.js";
import { FIELDS, METRICS, catalogPrompt, allowedFields, allowedMetrics } from "./catalog.js";
import { answerWithSql, formatRows, composeAnswer, buildCards } from "./sqlPlanner.js";

// Verdict band → score range (safe ≥70, suspicious 35-69, dangerous <35). Matches scoreBucket().
const BUCKET_RANGES = {
  safe:      { gte: 70 },
  suspicious:{ gte: 35, lt: 70 },
  dangerous: { lt: 35 },
};

// Catalog operator → Prisma filter key. gte/lte/gt/lt pass straight through; "eq" becomes Prisma's
// "equals" (the catalog uses the shorter "eq" for the LLM's benefit). This is the only translation
// between the catalog's vocabulary and Prisma's.
const prismaOp = (op) => (op === "eq" ? "equals" : op);

// Midnight UTC, n days ago. Used by the report builders' rolling windows. (UTC everywhere, matching
// dashboard.service.js; the heatmap surfaces the UTC caveat in its subtitle.)
const startOfUtcDay = (daysBack = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
};


// ── The LLM planner: question + catalog → a structured plan ──────────────────────────────────
// We describe the catalog (trimmed to the caller's role) and ask the model to pick ONE metric,
// its filters, and an optional group-by — using ONLY names from the catalog. Temperature 0 for
// determinism. The model may also return {unanswerable:true} for off-topic questions. This is the
// ONLY place natural language is interpreted; everything after is deterministic + validated.
const planWithLLM = async (question, role) => {
  const { metrics, fields } = catalogPrompt(role);
  const system =
    "You turn a question about an organization's phishing/threat-report data into a STRICT JSON " +
    "query plan. You do NOT write SQL and you MUST use ONLY the metric names, field names, " +
    "operators and values listed below — never invent one.\n\n" +
    `METRICS (pick exactly one):\n${metrics}\n\n` +
    `FIELDS (for filters and group-by):\n${fields}\n\n` +
    "Reply with ONLY minified JSON in one of these two shapes:\n" +
    '{"metric":"<metric name>","filters":[{"field":"<field name>","op":"<operator>","value":<string|number|boolean>}],"groupBy":"<field name or null>"}\n' +
    'or, if the question is not about this data: {"unanswerable":true,"reason":"<one short sentence>"}\n\n' +
    "RULES: Only the \"count\" metric takes filters/groupBy; the report metrics take neither. " +
    "For date phrases (\"this week\", \"last 7 days\", \"since July 1\") use the reportedAt field " +
    "with a gte operator and an ISO date value; today is " + new Date().toISOString().slice(0, 10) + ". " +
    "For verdict words (dangerous/suspicious/safe) use the verdict field. Map synonyms to the " +
    "closest listed value (e.g. \"malicious\"/\"scam\"/\"phishing link\" → verdict \"dangerous\"; " +
    "\"risky\" → \"suspicious\"). No prose, no markdown, JSON only.";
  return chatJSON({ system, user: `Question: ${question}\n\nReturn the JSON plan.`, maxTokens: 300, temperature: 0 });
};

// ── validatePlan: the SECURITY GATE. Check every token in the LLM's plan against the catalog. ──
// Returns a normalized, safe plan or null (→ honest fallback). `role` enforces the analyst-only
// gate: a member's plan may not name an analyst-only metric/field even if the LLM emitted one.
// Nothing here trusts the model — an unknown metric, field, op, or bad enum value is rejected.
export const validatePlan = (plan, role = "member") => {
  if (!plan || typeof plan !== "object" || plan.unanswerable) return null;

  const metricsForRole = allowedMetrics(role);
  const fieldsForRole = allowedFields(role);

  const metric = metricsForRole[plan.metric];
  if (!metric) return null; // unknown or not-allowed-for-role metric → reject

  // Report metrics take no filters/groupBy — return them bare (their builders do the rest).
  if (metric.kind === "report") {
    return { kind: "report", report: metric.report, metricKey: plan.metric };
  }

  // Count metric: validate + coerce each filter against the catalog.
  const rawFilters = Array.isArray(plan.filters) ? plan.filters : [];
  const filters = [];
  for (const f of rawFilters) {
    const def = fieldsForRole[f?.field];
    if (!def) return null;                    // unknown / not-allowed field → reject whole plan
    if (!def.ops.includes(f.op)) return null; // operator not allowed for this field → reject
    const value = coerceValue(def, f.value);
    if (value === REJECT) return null;        // wrong type / bad enum → reject
    filters.push({ field: f.field, def, op: f.op, value });
  }

  // group-by must be a catalog field flagged groupable on this metric, and allowed for the role.
  let groupBy = null;
  if (plan.groupBy && plan.groupBy !== "null") {
    if (!metric.groupableBy?.includes(plan.groupBy)) return null;
    if (!fieldsForRole[plan.groupBy]) return null; // e.g. member tried to group by reporter
    groupBy = plan.groupBy;
  }

  return { kind: "count", metricKey: plan.metric, filters, groupBy };
};

// Sentinel so a legitimately-falsey coerced value (0, false) isn't confused with a rejection.
const REJECT = Symbol("reject");

// Type-check + coerce one filter value against its catalog field definition.
const coerceValue = (def, raw) => {
  switch (def.type) {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : REJECT;
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      return REJECT;
    case "date": {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? REJECT : d;
    }
    case "enum":
    case "verdictBand":
      // Closed set — the value MUST be one the catalog declares (case-insensitive match).
      return def.values.find((v) => v.toLowerCase() === String(raw).toLowerCase()) ?? REJECT;
    case "tag":
    case "string":
      // Free text (attack-type category / reporter name). Trim + cap length; never becomes SQL.
      return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 100) : REJECT;
    default:
      return REJECT;
  }
};

// Bucket a raw safety score into the verdict label. Delegates to the ONE shared rubric in
// services/verdict.js so Insights can never disagree with Reports or the dashboard about
// what "dangerous" means (safe ≥70 · review ≥35 · else dangerous).
const bucketOf = (score) => scoreBucket(score);

// ── Access scope (org isolation + role-based privacy gate) ──────────────────────────────────
// Indicators are GLOBAL (one row per URL, shared by every org), so every read is narrowed to a
// per-caller allowlist of indicator ids. WHO may see WHICH indicators depends on the role:
//
//   analyst → every indicator THEIR ORG submitted (full org visibility — the analyst surface).
//   member  → only what a member is allowed to see in Team History: indicators THEY THEMSELVES
//             submitted, UNION indicators their org has an analyst-SHARED review on
//             (OrgReview.sharedWithOrg = true). This is the exact same privacy gate as
//             history.routes.js's ?org=1 branch — a member can never count a teammate's
//             un-shared, private submissions.
//
// Returning the allowlist as an array (not a boolean flag) means EVERY query below intersects the
// same set via `id: { in: ids }` — for an analyst that's a no-op superset, for a member it's the
// gate. One uniform rule, so there's no query that can accidentally skip the narrowing and leak.
const visibleIndicatorIds = async (prisma, scope) => {
  const { orgId, userId, role } = scope;

  if (isAnalyst(role)) {
    const rows = await prisma.submission.findMany({
      where: { orgId },
      select: { indicatorId: true },
      distinct: ["indicatorId"],
      take: MAX_ROWS,
    });
    return rows.map((r) => r.indicatorId);
  }

  // Member: own submissions ∪ analyst-shared reviews (the Team-History privacy gate).
  const [mine, shared] = await Promise.all([
    prisma.submission.findMany({
      where: { orgId, userId },
      select: { indicatorId: true },
      distinct: ["indicatorId"],
      take: MAX_ROWS,
    }),
    prisma.orgReview.findMany({
      where: { orgId, sharedWithOrg: true },
      select: { indicatorId: true },
      take: MAX_ROWS,
    }),
  ]);
  return [...new Set([...mine.map((r) => r.indicatorId), ...shared.map((r) => r.indicatorId)])];
};

// An "I looked, there's nothing here" answer. Used when the analyst has no org, or the org has
// no submissions yet. Shape matches a real answer so the client renders its normal empty state
// instead of erroring — and, crucially, we return this INSTEAD of running an unscoped query.
// An "I looked, there's nothing here" answer for when the caller has no org / no visible data.
// Shape matches a real answer so the client renders its normal empty state. Keyed off the plan
// kind + (for reports) the report type, since a `report` hands the client an OBJECT not an array.
const emptyResult = (plan) => {
  if (plan.kind === "report") {
    if (plan.report === "weekly") {
      return {
        data: { totals: { total: 0, dangerous: 0, suspicious: 0, safe: 0 }, daily: [], topThreats: [], findings: [] },
        chartSpec: { type: "report", title: REPORT_TITLES.weekly, empty: true },
      };
    }
    const type = { heatmap: "heatmap", trend: "trend", campaigns: "table", distribution: "histogram" }[plan.report];
    return { data: [], chartSpec: { type, title: REPORT_TITLES[plan.report], empty: true } };
  }
  // A count keeps its bucketCount shape when empty so the client renders the same card, not a
  // different one — the evidence list is simply empty. A grouped count renders as an empty bar.
  if (plan.groupBy) return { data: [], chartSpec: { type: "bar", title: "No data", groupBy: plan.groupBy, empty: true } };
  return { data: [], chartSpec: { type: "bucketCount", title: "No data", total: 0, reportTotal: 0, band: null, empty: true } };
};

// Percent change current-vs-previous. Same rubric as dashboard.service.js's trend() so the two
// screens describe a rise the same way.
const percentChange = (current, previous) => {
  if (previous === 0) {
    if (current === 0) return { pct: 0, direction: "flat" };
    return { pct: 100, direction: "up" }; // grew from nothing
  }
  const change = ((current - previous) / previous) * 100;
  return { pct: Math.round(Math.abs(change)), direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
};

// aiTags is a Json column, so it can be an array, a string, or null. Normalize defensively.
const tagsOf = (indicator) => {
  const raw = indicator?.aiTags;
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string" && t.trim());
  if (typeof raw === "string" && raw.trim()) return [raw];
  return [];
};

// The tag we treat as an indicator's "attack type" = its first tag. Seed data leads with the
// category ("Credential phishing"), which is what the trend chart groups by.
const attackTypeOf = (indicator) => tagsOf(indicator)[0] ?? "Uncategorized";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// 8 three-hour columns — matches the wireframe's 12am/3am/6am/…/9pm headings.
const SLOT_LABELS = ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"];
const HEATMAP_DAYS = 30;   // "Past 30 days" per the wireframe subtitle
const TREND_DAYS = 90;     // "90-Day Threat Trend"
const TREND_SERIES = 4;    // wireframe legend shows 4 attack types
const MAX_ROWS = 1000;     // safety cap on every read (matches the original take: 1000)

// ── Report 1 · Submission Activity Heatmap (day-of-week × time-of-day) ──────────────────────
// Counts the org's submissions in a 7×8 grid. Mon=0 (the wireframe starts the week on Monday)
// and each slot is a 3-hour block. Returns every cell, including empty ones, so the client can
// render a complete grid without inventing gaps.
const buildHeatmap = async (prisma, spec, orgId, indicatorIds) => {
  const since = startOfUtcDay(HEATMAP_DAYS - 1);
  const rows = await prisma.submission.findMany({
    // indicatorId ∈ allowlist enforces the caller's scope (member sees only own+shared).
    where: { orgId, indicatorId: { in: indicatorIds }, createdAt: { gte: since } },
    select: { createdAt: true },
    take: MAX_ROWS,
  });

  // Pre-build all 56 cells at zero so the grid is always complete.
  const grid = new Map();
  for (let day = 0; day < 7; day++) {
    for (let slot = 0; slot < SLOT_LABELS.length; slot++) grid.set(`${day}:${slot}`, 0);
  }

  for (const { createdAt } of rows) {
    const d = new Date(createdAt);
    const day = (d.getUTCDay() + 6) % 7;              // JS Sunday=0 → our Monday=0
    const slot = Math.floor(d.getUTCHours() / 3);      // 0-23 → one of 8 blocks
    const key = `${day}:${slot}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }

  const data = [...grid.entries()].map(([key, value]) => {
    const [day, slot] = key.split(":").map(Number);
    return { day, slot, value };
  });
  const max = Math.max(0, ...data.map((c) => c.value));

  return {
    data,
    chartSpec: {
      type: "heatmap",
      title: spec.title,
      days: DAY_LABELS,
      slots: SLOT_LABELS,
      max,
      subtitle: `Past ${HEATMAP_DAYS} days · times shown in UTC`,
    },
  };
};

// ── Report 2 · 90-Day Threat Trend by Attack Type ───────────────────────────────────────────
// One line per attack type (the indicator's first aiTag), bucketed into weeks. We keep only the
// busiest few types so the chart stays readable, and compute each one's first-half → second-half
// change in code (no LLM writing numbers).
const buildTrend = async (prisma, spec, orgId, indicatorIds) => {
  const since = startOfUtcDay(TREND_DAYS - 1);
  const rows = await prisma.submission.findMany({
    where: { orgId, indicatorId: { in: indicatorIds }, createdAt: { gte: since } },
    select: { createdAt: true, indicator: { select: { aiTags: true } } },
    take: MAX_ROWS,
  });

  // Rank attack types by volume, keep the top few.
  const volumeByType = new Map();
  for (const r of rows) {
    const type = attackTypeOf(r.indicator);
    volumeByType.set(type, (volumeByType.get(type) ?? 0) + 1);
  }
  const series = [...volumeByType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TREND_SERIES)
    .map(([type]) => type);

  // 13 weekly buckets across 90 days. Each bucket starts with every series at 0 so Recharts
  // draws a continuous line instead of breaking where a type had no submissions.
  const WEEKS = Math.ceil(TREND_DAYS / 7);
  const buckets = [];
  for (let week = 0; week < WEEKS; week++) {
    const start = new Date(since);
    start.setUTCDate(start.getUTCDate() + week * 7);
    const label = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][start.getUTCMonth()]} ${start.getUTCDate()}`;
    const bucket = { label };
    for (const type of series) bucket[type] = 0;
    buckets.push(bucket);
  }

  for (const r of rows) {
    const type = attackTypeOf(r.indicator);
    if (!series.includes(type)) continue; // outside the top N — not plotted
    const daysIn = Math.floor((new Date(r.createdAt) - since) / 86_400_000);
    const week = Math.min(WEEKS - 1, Math.max(0, Math.floor(daysIn / 7)));
    buckets[week][type] += 1;
  }

  // Per-series delta: second half of the window vs the first half.
  const half = Math.floor(WEEKS / 2);
  const deltas = series.map((type) => {
    const first = buckets.slice(0, half).reduce((sum, b) => sum + b[type], 0);
    const second = buckets.slice(half).reduce((sum, b) => sum + b[type], 0);
    return { label: type, ...percentChange(second, first) };
  });

  return { data: buckets, chartSpec: { type: "trend", title: spec.title, series, deltas, subtitle: `Past ${TREND_DAYS} days` } };
};

// ── Report 3 · Active Threat Campaigns (table) ──────────────────────────────────────────────
// Reuses listCampaigns() (the same helper GET /api/campaigns serves the triage queue from) so
// the field names match what the queue already renders, then enriches each row with the average
// safety score of its indicators. Status is derived from that average:
//   dangerous → Active · review → Monitoring · safe → Contained
const CAMPAIGN_STATUS = { dangerous: "Active", review: "Monitoring", safe: "Contained" };

const buildCampaignTable = async (prisma, spec, orgId) => {
  const campaigns = await listCampaigns(prisma, orgId);
  if (campaigns.length === 0) {
    return { data: [], chartSpec: { type: "table", title: spec.title, empty: true } };
  }

  // One query for every campaign's reviews + scores (avoids an N+1 across campaigns).
  const reviews = await prisma.orgReview.findMany({
    where: { orgId, campaignId: { in: campaigns.map((c) => c.id) } },
    select: { campaignId: true, indicator: { select: { aiScore: true } } },
    take: MAX_ROWS,
  });

  const scoresByCampaign = new Map();
  for (const r of reviews) {
    const score = r.indicator?.aiScore;
    if (score == null) continue; // unscored indicators shouldn't drag the average
    if (!scoresByCampaign.has(r.campaignId)) scoresByCampaign.set(r.campaignId, []);
    scoresByCampaign.get(r.campaignId).push(score);
  }

  const data = campaigns.map((c) => {
    const scores = scoresByCampaign.get(c.id) ?? [];
    const avgScore = scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
    const band = bucketOf(avgScore);
    return {
      id: c.id,
      name: c.name,
      indicatorCount: c.indicatorCount,
      reportCount: c.reportCount,
      avgScore,
      band,
      status: CAMPAIGN_STATUS[band],
      last_seen: c.last_seen,
    };
  });

  // Most dangerous first (lowest safety score), so the analyst's eye lands on what matters.
  data.sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101));

  return {
    data,
    chartSpec: { type: "table", title: spec.title, subtitle: `${data.length} campaign${data.length === 1 ? "" : "s"} detected` },
  };
};

// ── Report 4 · Orbis Score Distribution (histogram) ─────────────────────────────────────────
// Ten buckets of 10 points across the 0-100 safety score, each coloured by its verdict band.
// NOTE: the band edges come from scoreBucket() (safe ≥70 · review ≥35), NOT the wireframe's
// 0-33/34-66/67-100 labels — the code is the single source of truth the rest of the app shares.
const buildHistogram = async (prisma, spec, orgId, indicatorIds) => {
  const rows = await prisma.indicator.findMany({
    where: { id: { in: indicatorIds }, aiScore: { not: null } },
    select: { aiScore: true },
    take: MAX_ROWS,
  });

  const buckets = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${i * 10 + 9}`,
    value: 0,
    band: bucketOf(i * 10 + 5), // colour by the middle of the bucket
  }));
  for (const { aiScore } of rows) {
    const index = Math.min(9, Math.max(0, Math.floor(aiScore / 10)));
    buckets[index].value += 1;
  }

  // Legend rows: count + share per verdict band, with the REAL score edges.
  const total = rows.length;
  const bandCounts = { dangerous: 0, review: 0, safe: 0 };
  for (const { aiScore } of rows) bandCounts[bucketOf(aiScore)] += 1;
  const share = (n) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10); // 1 decimal
  const bands = [
    { band: "dangerous", label: "Dangerous (0–34)",  count: bandCounts.dangerous, pct: share(bandCounts.dangerous) },
    { band: "review",    label: "Suspicious (35–69)", count: bandCounts.review,    pct: share(bandCounts.review) },
    { band: "safe",      label: "Safe (70–100)",      count: bandCounts.safe,      pct: share(bandCounts.safe) },
  ];

  return {
    data: buckets,
    chartSpec: { type: "histogram", title: spec.title, bands, subtitle: `${total} scored submission${total === 1 ? "" : "s"}` },
  };
};

// ── Report 5 · Weekly Threat Report ─────────────────────────────────────────────────────────
// The composite card: totals, a stacked day-by-verdict bar chart, the week's worst threats, and
// findings. The findings text is COMPUTED (percentChange above), never LLM-written, so the
// numbers in the sentence always match the numbers in the chart.
const buildWeeklyReport = async (prisma, spec, orgId, indicatorIds) => {
  const weekStart = startOfUtcDay(6);      // 7 days incl. today
  const prevWeekStart = startOfUtcDay(13); // the 7 days before that, for the comparison

  const rows = await prisma.submission.findMany({
    // Scope gate: only indicators the caller may see (member = own + analyst-shared).
    where: { orgId, indicatorId: { in: indicatorIds }, createdAt: { gte: prevWeekStart } },
    select: {
      indicatorId: true,
      createdAt: true,
      indicator: { select: { aiTitle: true, domain: true, aiScore: true, aiTags: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const thisWeek = rows.filter((r) => r.createdAt >= weekStart);
  const lastWeek = rows.filter((r) => r.createdAt < weekStart);

  // Totals by band (BAND_KEY maps our internal "review" band to the UI's "suspicious" wording).
  const BAND_KEY = { dangerous: "dangerous", review: "suspicious", safe: "safe" };
  const totals = { total: thisWeek.length, dangerous: 0, suspicious: 0, safe: 0 };
  for (const r of thisWeek) totals[BAND_KEY[bucketOf(r.indicator?.aiScore)]] += 1;

  // One stacked bar per day, Mon-first, including quiet days.
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfUtcDay(i);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const ofDay = thisWeek.filter((r) => r.createdAt >= dayStart && r.createdAt < dayEnd);
    const bar = { label: DAY_LABELS[(dayStart.getUTCDay() + 6) % 7].slice(0, 1), dangerous: 0, suspicious: 0, safe: 0 };
    for (const r of ofDay) bar[BAND_KEY[bucketOf(r.indicator?.aiScore)]] += 1;
    daily.push(bar);
  }

  // Top threats = this week's most dangerous unique indicators (lowest safety score first).
  const seen = new Set();
  const unique = [];
  for (const r of thisWeek) {
    if (seen.has(r.indicatorId)) continue;
    seen.add(r.indicatorId);
    unique.push(r);
  }
  const topThreats = unique
    .sort((a, b) => (a.indicator?.aiScore ?? 101) - (b.indicator?.aiScore ?? 101))
    .slice(0, 4)
    .map((r) => ({
      indicatorId: r.indicatorId,
      title: r.indicator?.aiTitle ?? r.indicator?.domain ?? "Unknown link",
      tag: attackTypeOf(r.indicator),
      aiScore: r.indicator?.aiScore ?? null,
      band: bucketOf(r.indicator?.aiScore),
    }));

  // Findings, computed from the two windows.
  const volume = percentChange(thisWeek.length, lastWeek.length);
  const dangerousLastWeek = lastWeek.filter((r) => bucketOf(r.indicator?.aiScore) === "dangerous").length;
  const dangerous = percentChange(totals.dangerous, dangerousLastWeek);
  const findings = [
    { text: `${volume.pct}% ${volume.direction === "down" ? "fewer" : "more"} submissions than last week`, ...volume },
    { text: `${dangerous.pct}% ${dangerous.direction === "down" ? "drop" : "increase"} in dangerous links vs last week`, ...dangerous },
  ];
  if (topThreats.length > 0) {
    findings.push({ text: `Most common attack type: ${topThreats[0].tag}`, direction: "flat", pct: 0 });
  }

  const range = `${weekStart.toISOString().slice(0, 10)} → ${new Date().toISOString().slice(0, 10)}`;
  return { data: { totals, daily, topThreats, findings }, chartSpec: { type: "report", title: spec.title, subtitle: range } };
};

// Dispatch a validated named report to its builder. `scope` carries the caller's role so
// analyst-only reports (campaigns) can be gated; every builder gets the pre-computed
// indicatorIds allowlist so its reads stay within the caller's visibility.
const buildReport = (prisma, spec, orgId, indicatorIds, scope) => {
  if (spec.report === "heatmap") return buildHeatmap(prisma, spec, orgId, indicatorIds);
  if (spec.report === "trend") return buildTrend(prisma, spec, orgId, indicatorIds);
  if (spec.report === "campaigns") {
    // Campaigns are an analyst construct (clustering + triage). A member has no campaign
    // surface, so we return the empty table rather than exposing org-wide campaign rollups.
    if (!isAnalyst(scope.role)) return { data: [], chartSpec: { type: "table", title: spec.title, empty: true } };
    return buildCampaignTable(prisma, spec, orgId);
  }
  if (spec.report === "distribution") return buildHistogram(prisma, spec, orgId, indicatorIds);
  return buildWeeklyReport(prisma, spec, orgId, indicatorIds);
};

// ── The unified COUNT builder: one query path for every filter/group-by in the catalog ───────
// The plan's filters name catalog FIELDS; each field knows its table (submission / indicator /
// orgReview) and column, so we translate the plan into ONE parameterized Prisma `where` on the
// org's submissions, joined to the indicator (and, when needed, the org's review). We count over
// SUBMISSIONS (not indicators) because "this week" means when the ORG reported it, and dedup to
// one row per link while keeping the report count. Scoped to `indicatorIds` = the caller's
// visible set, so a member never counts a teammate's private submission.
//
// A groupBy returns a labelled breakdown ({label,value}[]) for a bar/pie; otherwise it returns the
// number PLUS the matching links (the "which ones?" evidence the analyst always wants next).
const buildCount = async (prisma, plan, orgId, indicatorIds) => {
  // Split the validated filters by which table they constrain.
  const where = { orgId, indicatorId: { in: indicatorIds } };
  const indicatorWhere = {};
  let reviewStatusFilter = null;

  for (const f of plan.filters) {
    const { def, op, value, field } = f;
    if (field === "verdict") {
      // Verdict band → an aiScore range on the indicator.
      Object.assign(indicatorWhere, { aiScore: { ...(indicatorWhere.aiScore || {}), ...BUCKET_RANGES[value] } });
    } else if (field === "attackType") {
      // aiTags is a JSON array; Prisma `array_contains` matches an exact tag string.
      indicatorWhere.aiTags = { array_contains: value };
    } else if (def.table === "indicator") {
      indicatorWhere[def.column] = { ...(indicatorWhere[def.column] || {}), [prismaOp(op)]: value };
    } else if (def.table === "submission") {
      if (def.column === "userName") where.user = { name: value };
      else where[def.column] = { ...(where[def.column] || {}), [prismaOp(op)]: value };
    } else if (def.table === "orgReview") {
      // Review status lives on the org's OrgReview row → resolve to the matching indicator ids
      // (still inside the caller's visible set) and intersect.
      reviewStatusFilter = value;
    }
  }

  // If a review-status filter is present, narrow indicatorIds to those with that status first.
  let scopedIds = indicatorIds;
  if (reviewStatusFilter) {
    const reviewed = await prisma.orgReview.findMany({
      where: { orgId, indicatorId: { in: indicatorIds }, reviewStatus: reviewStatusFilter },
      select: { indicatorId: true },
      take: MAX_ROWS,
    });
    scopedIds = reviewed.map((r) => r.indicatorId);
    where.indicatorId = { in: scopedIds };
    if (scopedIds.length === 0) {
      return { data: [], chartSpec: { type: "bucketCount", title: titleFor(plan), total: 0, reportTotal: 0, band: null, empty: true } };
    }
  }
  if (Object.keys(indicatorWhere).length) where.indicator = indicatorWhere;

  const submissions = await prisma.submission.findMany({
    where,
    orderBy: { createdAt: "desc" }, // newest first → dedup keeps the latest report
    select: {
      indicatorId: true,
      createdAt: true,
      source: true,
      user: { select: { name: true, email: true } },
      indicator: { select: { aiTitle: true, domain: true, aiScore: true, aiTags: true, blacklistHit: true, aiConfidence: true } },
    },
    take: MAX_ROWS,
  });

  // ── Grouped breakdown → labelled chart data ──
  if (plan.groupBy) {
    const counts = new Map();
    const seen = new Set(); // dedup to unique indicators for the breakdown
    for (const s of submissions) {
      if (seen.has(s.indicatorId)) continue;
      seen.add(s.indicatorId);
      for (const key of groupKeys(plan.groupBy, s)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const data = [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { data, chartSpec: { type: "bar", title: titleFor(plan), groupBy: plan.groupBy, empty: data.length === 0 } };
  }

  // ── Plain count → number + the links behind it ──
  const byIndicator = new Map();
  for (const s of submissions) {
    const existing = byIndicator.get(s.indicatorId);
    if (existing) { existing.reportCount += 1; continue; }
    const tags = Array.isArray(s.indicator?.aiTags) ? s.indicator.aiTags : [];
    byIndicator.set(s.indicatorId, {
      indicatorId: s.indicatorId,
      title: s.indicator?.aiTitle ?? s.indicator?.domain ?? "Untitled link",
      domain: s.indicator?.domain ?? null,
      score: s.indicator?.aiScore ?? null,
      band: bucketOf(s.indicator?.aiScore),
      tag: tags[0] ?? null,
      blacklisted: s.indicator?.blacklistHit ?? false,
      reportedBy: s.user?.name ?? s.user?.email ?? "A teammate",
      reportedAt: s.createdAt,
      reportCount: 1,
    });
  }
  const links = [...byIndicator.values()].sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
  return {
    data: links,
    chartSpec: {
      type: "bucketCount",
      title: titleFor(plan),
      total: links.length,
      reportTotal: submissions.length,
      band: null,
      empty: links.length === 0,
    },
  };
};

// The group-by key(s) for one submission. attackType can yield several (a link has many tags).
const groupKeys = (groupBy, s) => {
  const ind = s.indicator ?? {};
  // scoreBucket returns the INTERNAL "review" label; the catalog + UI use "suspicious", so map it
  // for display consistency (a filter uses "suspicious" too).
  if (groupBy === "verdict") return [bucketOf(ind.aiScore) === "review" ? "suspicious" : bucketOf(ind.aiScore)];
  if (groupBy === "confidence") return [ind.aiConfidence ?? "unrated"];
  if (groupBy === "channel") return [s.source === "email" ? "email" : "web"];
  if (groupBy === "reporter") return [s.user?.name ?? s.user?.email ?? "Unknown"];
  if (groupBy === "attackType") {
    const tags = Array.isArray(ind.aiTags) ? ind.aiTags.filter((t) => typeof t === "string" && t.trim()) : [];
    return tags.length ? tags : ["Uncategorized"];
  }
  return ["Total"];
};

// A readable title from the plan: "<verdict> links this week", "Reports pending review", etc.
// Derived from the filters so the card header always reflects what was actually asked.
const titleFor = (plan) => {
  const byField = Object.fromEntries(plan.filters.map((f) => [f.field, f.value]));
  // Review status is its own phrasing ("Reports pending review").
  if (byField.reviewStatus) return `Reports ${byField.reviewStatus}`;

  const parts = [];
  if (byField.verdict) parts.push(cap(byField.verdict));
  if (byField.confidence) parts.push(`${byField.confidence}-confidence`);
  if (byField.attackType) parts.push(byField.attackType);
  if (byField.blacklisted === true) parts.push("blacklisted");
  parts.push("links");
  if (byField.channel) parts.push(`from ${byField.channel}`);
  // A date filter reads as "this week" only when it's the ~last 7 days; otherwise leave it generic
  // rather than assert a window we didn't actually compute.
  const reportedAt = plan.filters.find((f) => f.field === "reportedAt" && f.op === "gte");
  if (reportedAt) {
    const days = Math.round((Date.now() - new Date(reportedAt.value).getTime()) / 86_400_000);
    if (days >= 6 && days <= 8) parts.push("this week");
    else if (days >= 28 && days <= 31) parts.push("this month");
  }
  return cap(parts.join(" "));
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Dispatch a validated plan to its builder. `scope` carries the caller's role (report gating);
// every builder gets the pre-computed indicatorIds allowlist so reads stay within visibility.
export const runNlpQuery = async (prisma, plan, scope) => {
  const orgId = scope?.orgId;
  if (!orgId) return emptyResult(plan);

  const indicatorIds = await visibleIndicatorIds(prisma, scope);
  if (indicatorIds.length === 0) return emptyResult(plan);

  if (plan.kind === "report") {
    return buildReport(prisma, { report: plan.report, title: REPORT_TITLES[plan.report] }, orgId, indicatorIds, scope);
  }
  return buildCount(prisma, plan, orgId, indicatorIds);
};

// Titles for the 5 named reports (kept here so the report builders get a stable header).
const REPORT_TITLES = {
  weekly: "Weekly Threat Report",
  heatmap: "Submission Activity Heatmap",
  trend: "90-Day Threat Trend by Attack Type",
  campaigns: "Active Threat Campaigns",
  distribution: "Orbis Score Distribution",
};

// Top-level: question → answer. The interactive flow, no gatekeeper in front of the data:
//
//   question → LLM writes SQL over the v_reports view → sqlGuard proves it's a safe read-only,
//   single-view SELECT → the scoped executor runs it under the caller's org + privacy gate → the
//   LLM reads the ACTUAL rows and writes a professional, natural answer → we attach embedded cards
//   when the rows are individual reports.
//
// It's the "here's a document, answer from it" model: the LLM goes to the data, answers in prose,
// and if the answer isn't there it says so. Every shareable column is exposed via the view; nothing
// sensitive is (no Clerk ids / emails / raw URLs), so letting the model narrate is safe.
//
// Response shape serves BOTH consumers:
//   • { answer, cards }         — the chat sidebar (prose + embedded report cards)
//   • { data, chartSpec }       — the Insights page (still renders charts from the same rows)
//   • { fallback }              — LLM unavailable, or the model couldn't form a safe query
export const answerNlpQuery = async (prisma, question, scope) => {
  let result;
  try {
    result = await answerWithSql(question, scope);
  } catch (e) {
    console.warn("⚠ nlp-query SQL engine failed:", e.message);
    return { fallback: "Orbo's data assistant is temporarily unavailable — please try again in a moment." };
  }

  // The guard/executor couldn't produce a safe query for this question (e.g. it wasn't about the
  // data at all, so the model couldn't write valid SQL over the view). Say so honestly.
  if (result.error) {
    return { fallback: "I can only answer from your team's threat-report data, and I couldn't find that there. Try asking about your links, verdicts, reporters, channels, or review queue." };
  }

  const rows = result.rows ?? [];
  // The LLM writes the prose answer from the real rows; deterministic fallbacks below if it can't.
  const answer = (await composeAnswer(question, rows)) ?? deterministicAnswer(rows);
  const cards = buildCards(rows);
  // Keep the chart shape too, so the Insights page (same endpoint) still renders visuals.
  const { data, chartSpec } = formatRows(rows, question);
  return { answer, cards, data, chartSpec };
};

// A minimal, honest sentence if the prose LLM call itself failed (rare). Never invents data.
const deterministicAnswer = (rows) => {
  if (!rows.length) return "There's nothing matching that in your reports.";
  if (rows.length === 1) {
    const only = rows[0];
    const keys = Object.keys(only);
    if (keys.length === 1) return `Result: ${String(only[keys[0]])}.`;
  }
  return `I found ${rows.length} matching ${rows.length === 1 ? "report" : "reports"}.`;
};

// Honest "I can't answer that" — lists what Orbo CAN do so the user can re-aim, without repeating
// their exact phrasing back at them. Members don't see campaigns, so tailor the examples.
const unanswerableMessage = (role) =>
  "I answer questions about your team's threat reports — for example: \"how many dangerous links " +
  "this week\", \"how many came from email\", \"break down checks by verdict\", \"how many pending " +
  "review\"" + (role === "analyst" ? ", or \"show the weekly report / active campaigns\"" : "") +
  ". I couldn't map that question to the data I hold — try one of those.";
