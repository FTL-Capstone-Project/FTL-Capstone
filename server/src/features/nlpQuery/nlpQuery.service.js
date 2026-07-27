// ── feature: nlp-query · owner: David · charts 3–6 built by Ozias ──
// AI Feature B: an analyst asks the threat history in plain English ("how many dangerous
// links this week?", "top impersonated brands"), and we turn it into a CHART.
//
// SECURITY MODEL (the whole point): the LLM never touches SQL and never picks a raw field.
// It proposes a STRUCTURED spec constrained to a WHITELIST. We then validate every field,
// operator, and value against that whitelist and build a PARAMETERIZED Prisma query. Model
// output that fails validation is rejected → the "try rephrasing" fallback. This is the same
// discipline as the verdict pipeline: the AI narrates/proposes, code makes the real decision.
//
// TWO KINDS OF ANSWER:
//   1. a GENERIC chart (count/bar/line/pie) built from a free-form filter + groupBy — David's
//      original path, unchanged below.
//   2. a NAMED REPORT (weekly report, heatmap, 90-day trend, campaigns table, score histogram) —
//      the five wireframed variants. These take no filters, so the model only picks a name from
//      the REPORTS whitelist and code does all the querying and maths.
//
// ORG ISOLATION (project_plan.md §5, story #12): indicators are a GLOBAL table shared by every
// org, so every read here is narrowed to the indicators THIS analyst's org actually submitted.
// Without that narrowing an analyst would be counting other orgs' links.
import { chatJSON } from "../../services/llm.js";
import { scoreBucket } from "../../services/verdict.js";
import { listCampaigns } from "../campaigns/campaigns.service.js";

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

// ── The NAMED REPORTS whitelist (the 5 wireframed variants) ──
// Same idea as CHART_TYPES: the model may only name one of these keys. The chart type is
// DERIVED here from the key — never taken from the model — so the two can't disagree.
// Titles match the wireframes in client/src/assets/wireframes/Analyst/.
const REPORTS = {
  weekly:       { chart: "report",    title: "Weekly Threat Report" },
  heatmap:      { chart: "heatmap",   title: "Submission Activity Heatmap" },
  trend:        { chart: "trend",     title: "90-Day Threat Trend by Attack Type" },
  campaigns:    { chart: "table",     title: "Active Threat Campaigns" },
  distribution: { chart: "histogram", title: "Orbis Score Distribution" },
};

// The prompt chips on the Insights page are canned strings, so we can recognise the common
// questions WITHOUT paying for a Claude call. Each report lists keyword sets: a question matches
// when every word in any one set appears. Order matters — the first match wins.
const REPORT_KEYWORDS = {
  weekly:       [["weekly"], ["week", "report"]],
  heatmap:      [["heatmap"], ["heat", "map"], ["when", "submitted"], ["most", "common", "time"]],
  trend:        [["trend"], ["90", "day"], ["over", "time"], ["attack", "type"]],
  campaigns:    [["campaign"]],
  distribution: [["distribution"], ["histogram"], ["score", "spread"], ["score", "breakdown"]],
};

// ── Small date helper (UTC, no external dep) ──
// UTC everywhere, matching dashboard.service.js. Defined up here because arrow consts aren't
// hoisted and the keyword matcher below calls it. The heatmap surfaces the UTC caveat in its
// subtitle so an analyst in another timezone isn't misled by the hour labels.
const startOfUtcDay = (daysBack = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
};

// The GENERIC (non-report) prompt chips deserve the same no-LLM treatment. Every string the
// Insights page offers as a chip must answer without depending on the model: the chip is a
// promise the UI makes, and "How many dangerous links this week?" used to be the only one that
// could fail — the LLM sometimes answered {"unmappable":true} or a spec that failed validation,
// which surfaced as the "try rephrasing" fallback suggesting the very question just asked.
// Each entry maps keyword sets → the already-validated spec shape validateSpec() produces.
const COUNT_BUCKETS = { dangerous: "dangerous", suspicious: "review", safe: "safe" };
const THIS_WEEK_WORDS = [["this", "week"], ["last", "7", "days"], ["past", "week"], ["7", "days"]];

// "how many <bucket> links this week" → a count filtered to that verdict + the last 7 days.
const matchBucketCount = (text) => {
  // "how many" (or "count") + a verdict word is the shape we recognise. Anything more
  // specific still falls through to the LLM, which can express filters we don't hardcode.
  const asksHowMany = text.includes("how many") || text.includes("count of") || text.startsWith("count ");
  if (!asksHowMany) return null;

  const bucketWord = Object.keys(COUNT_BUCKETS).find((word) => text.includes(word));
  if (!bucketWord) return null;

  const scopedToWeek = THIS_WEEK_WORDS.some((set) => set.every((word) => text.includes(word)));
  const filters = [];
  let title = `${bucketWord[0].toUpperCase()}${bucketWord.slice(1)} links`;
  if (scopedToWeek) {
    // Same 7-day window the weekly report uses, so the two screens can't disagree.
    filters.push({ column: "createdAt", op: "gte", value: startOfUtcDay(6) });
    title += " this week";
  }
  // bucketCount marks this for the evidence-carrying builder (number + the links behind it),
  // rather than the generic path's bare total.
  return { chart: "count", bucketCount: true, groupBy: null, filters, verdictBucket: COUNT_BUCKETS[bucketWord], title };
};

// Try to map a question straight to an answer with NO LLM call. Returns a validated spec or null.
// Two families: the 5 named reports, and the generic "how many X" counts above.
export const matchReport = (question) => {
  const text = String(question ?? "").toLowerCase();
  for (const [report, keywordSets] of Object.entries(REPORT_KEYWORDS)) {
    const hit = keywordSets.some((set) => set.every((word) => text.includes(word)));
    if (hit) return { report, chart: REPORTS[report].chart, title: REPORTS[report].title };
  }
  return matchBucketCount(text);
};

// Group-by dimensions the analyst can slice by (safe columns only).
const GROUP_BY = {
  verdict:     "aiScore",     // bucketed into safe/review/dangerous
  status:      "status",
  reviewStatus:"globalReviewStatus",
  day:         "createdAt",   // grouped by calendar day
};

// The JSON contract we force the LLM to return. Kept tight so validation is simple.
const SYSTEM = `You translate an analyst's plain-English question about a threat-history database
into a STRICT JSON query spec. You do NOT write SQL. Reply with ONLY minified JSON.

If the question asks for one of these five standard reports, reply ONLY:
{"report":"weekly|heatmap|trend|campaigns|distribution"}
  weekly       = a weekly threat report / this week's summary
  heatmap      = WHEN threats are submitted (day-of-week x time-of-day activity)
  trend        = how attack types have trended over the last 90 days
  campaigns    = a breakdown of active threat campaigns
  distribution = the spread/distribution of safety scores

Otherwise reply:
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

  // A named report short-circuits everything: the key must be in REPORTS, and we take the chart
  // type + title from OUR table, not from the model. Any filters/groupBy it sent are ignored.
  if (spec.report != null) {
    const report = REPORTS[spec.report];
    if (!report) return null; // unknown report name → reject (same as an unknown chart type)
    return { report: spec.report, chart: report.chart, title: report.title };
  }

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

// Bucket a raw safety score into the verdict label. Delegates to the ONE shared rubric in
// services/verdict.js so Insights can never disagree with Reports or the dashboard about
// what "dangerous" means (safe ≥70 · review ≥35 · else dangerous).
const bucketOf = (score) => scoreBucket(score);

// ── Org isolation ───────────────────────────────────────────────────────────────────────────
// Indicators are GLOBAL (one row per URL, shared by every org), so "which indicators may this
// analyst see?" = "which indicators did their org submit?". We look that up once and then narrow
// every query with `id: { in: ids }`. Same shape as the analyst branch in history.routes.js.
const orgIndicatorIds = async (prisma, orgId) => {
  const rows = await prisma.submission.findMany({
    where: { orgId },
    select: { indicatorId: true },
    distinct: ["indicatorId"],
    take: MAX_ROWS,
  });
  return rows.map((r) => r.indicatorId);
};

// An "I looked, there's nothing here" answer. Used when the analyst has no org, or the org has
// no submissions yet. Shape matches a real answer so the client renders its normal empty state
// instead of erroring — and, crucially, we return this INSTEAD of running an unscoped query.
const emptyResult = (spec) => {
  if (spec.chart === "report") {
    return {
      data: { totals: { total: 0, dangerous: 0, suspicious: 0, safe: 0 }, daily: [], topThreats: [], findings: [] },
      chartSpec: { type: "report", title: spec.title, empty: true },
    };
  }
  // A bucket count keeps its own shape when empty so the client renders the same card, not a
  // different one — the evidence list is simply empty.
  if (spec.bucketCount) {
    return { data: [], chartSpec: { type: "bucketCount", title: spec.title, total: 0, reportTotal: 0, band: spec.verdictBucket, empty: true } };
  }
  if (spec.chart === "count") return { data: [{ label: "Total", value: 0 }], chartSpec: { type: "count", title: spec.title, empty: true } };
  return { data: [], chartSpec: { type: spec.chart, title: spec.title, empty: true } };
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
const buildHeatmap = async (prisma, spec, orgId) => {
  const since = startOfUtcDay(HEATMAP_DAYS - 1);
  const rows = await prisma.submission.findMany({
    where: { orgId, createdAt: { gte: since } },
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
const buildWeeklyReport = async (prisma, spec, orgId) => {
  const weekStart = startOfUtcDay(6);      // 7 days incl. today
  const prevWeekStart = startOfUtcDay(13); // the 7 days before that, for the comparison

  const rows = await prisma.submission.findMany({
    where: { orgId, createdAt: { gte: prevWeekStart } },
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

// Dispatch a validated named report to its builder.
const buildReport = (prisma, spec, orgId, indicatorIds) => {
  if (spec.report === "heatmap") return buildHeatmap(prisma, spec, orgId);
  if (spec.report === "trend") return buildTrend(prisma, spec, orgId, indicatorIds);
  if (spec.report === "campaigns") return buildCampaignTable(prisma, spec, orgId);
  if (spec.report === "distribution") return buildHistogram(prisma, spec, orgId, indicatorIds);
  return buildWeeklyReport(prisma, spec, orgId);
};

// ── "How many <verdict> links this week?" — the count, PLUS the links it counted ────────────
// A bare number is not actionable: an analyst's next question is always "which ones?". So the
// count chip returns the matching links with the detail needed to triage them, and the client
// renders the number with an evidence list underneath.
//
// This builder also fixes a subtle correctness bug in the generic path. `createdAt` in FIELDS
// maps to Indicator.createdAt = when the URL was FIRST SEEN GLOBALLY (by any org, ever). What an
// analyst means by "this week" is when THEIR ORG reported it — Submission.createdAt. Filtering on
// the indicator's own date counted links the org reported months ago but that happened to be
// first seen recently (and missed old links freshly re-reported). We count DISTINCT indicators
// from the org's submissions in the window instead.
const buildBucketCount = async (prisma, spec, orgId) => {
  const range = BUCKET_RANGES[spec.verdictBucket];
  // The date filter (if the question was scoped to a week) applies to the SUBMISSION.
  const submittedAt = spec.filters.find((f) => f.column === "createdAt");

  const submissions = await prisma.submission.findMany({
    where: {
      orgId,
      ...(submittedAt ? { createdAt: { [submittedAt.op]: submittedAt.value } } : {}),
      indicator: { aiScore: range },
    },
    orderBy: { createdAt: "desc" }, // newest first, so the dedup below keeps the latest report
    select: {
      indicatorId: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      indicator: { select: { aiTitle: true, domain: true, aiScore: true, aiTags: true, blacklistHit: true } },
    },
    take: MAX_ROWS,
  });

  // One row per link even when several teammates reported it — but keep the report count, since
  // "5 people hit this one" is exactly the signal an analyst prioritises on.
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
  // Most dangerous first (lowest safety score) — the triage order the analyst wants.
  const links = [...byIndicator.values()].sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

  return {
    data: links,
    chartSpec: {
      type: "bucketCount",
      title: spec.title,
      total: links.length,
      // How many times those links were reported in total — "8 reports across 5 links".
      reportTotal: submissions.length,
      band: spec.verdictBucket,
      empty: links.length === 0,
    },
  };
};

// Run the validated query and shape the result into { data, chartSpec } for the client.
// `prisma` is passed in (same testable pattern as the other services). `orgId` is the caller's
// org — every read is narrowed to it (story #12); null/0 → an empty result, never a global read.
export const runNlpQuery = async (prisma, spec, orgId) => {
  if (!orgId) return emptyResult(spec);

  const indicatorIds = await orgIndicatorIds(prisma, orgId);
  if (indicatorIds.length === 0) return emptyResult(spec);

  // The five named reports each have their own builder.
  if (spec.report) return buildReport(prisma, spec, orgId, indicatorIds);

  // A verdict-bucket count answers with evidence (see buildBucketCount). Only the keyword path
  // sets this shape — an LLM-authored count with a groupBy still uses the generic path below.
  if (spec.bucketCount) return buildBucketCount(prisma, spec, orgId);

  const where = { ...buildWhere(spec), id: { in: indicatorIds } };
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
// `orgId` is the caller's org, threaded through so every query stays org-scoped.
export const answerNlpQuery = async (prisma, question, orgId) => {
  // Fast path: the 5 named reports are recognisable from keywords, so the common questions
  // (including every prompt chip on the Insights page) skip the Claude call entirely.
  const matched = matchReport(question);
  if (matched) return runNlpQuery(prisma, matched, orgId);

  const raw = await chatJSON({ system: SYSTEM, user: `Question: ${question}\n\nReturn the JSON spec.`, maxTokens: 300, temperature: 0 });
  const spec = validateSpec(raw);
  if (!spec) {
    return { fallback: "I couldn't turn that into a chart. Try rephrasing — e.g. \"how many dangerous links this week?\" or \"break down checks by verdict\"." };
  }
  const result = await runNlpQuery(prisma, spec, orgId);
  return result;
};
