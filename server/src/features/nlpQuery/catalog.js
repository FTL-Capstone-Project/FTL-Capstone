// ── feature: nlp-query · the DATA CATALOG (the "form") · owner: Michael ──
//
// This file is the single source of truth for what the Ask-Orbo data assistant can answer. It is
// BOTH:
//   1. the menu we hand the LLM (turned into prompt text by catalogPrompt()), so the model knows
//      exactly what data exists and how to describe a query against it — in plain language, no
//      keywords; and
//   2. the VALIDATION WHITELIST (validatePlan() in nlpQuery.service.js checks every metric,
//      dimension, filter field, operator and enum value against these tables). The LLM only ever
//      PROPOSES a plan; nothing here-unlisted can reach a query. This is the security gate — the
//      model's language understanding is trusted, its discipline is not.
//
// WHEN THE DATA MODEL CHANGES: update this file. Every FIELD.column below names a real column in
// schema.prisma; catalog.schema.test.js fails the build if one goes missing, so the form can't
// silently drift out of sync with the database.
//
// ORG ISOLATION (story #12) + the MEMBER PRIVACY GATE are enforced in the service, not here: every
// query is narrowed to the caller's visible indicator set (analyst = whole org; member = their own
// submissions ∪ analyst-shared reviews). The catalog just declares WHICH reporter/field a member
// may even ask about (see `analystOnly`).

// ── DIMENSIONS: things a metric can be grouped-by or filtered-on. Each maps to a REAL column. ──
// `table` says where the column lives ("indicator" = the global Indicator row joined to each
// submission; "submission" = the per-report row; "orgReview" = the org's private review row).
// `type` drives value coercion + which ops are allowed. `values` locks an enum to a closed set.
// `describe` is the plain-English line the LLM reads. `analystOnly` fields are dropped from a
// member's catalog + rejected if a member's plan references them.
export const FIELDS = {
  verdict: {
    column: "aiScore", table: "indicator", type: "verdictBand",
    describe: 'The AI safety verdict of a link, as a band: "safe", "suspicious", or "dangerous" ' +
      "(derived from the 0-100 safety score: safe ≥70, suspicious 35-69, dangerous <35). Use this " +
      'for questions like "how many dangerous links" or "break down checks by verdict".',
    values: ["safe", "suspicious", "dangerous"],
    ops: ["eq"],
  },
  score: {
    column: "aiScore", table: "indicator", type: "number",
    describe: "The raw 0-100 AI safety score (100 = completely safe, 0 = definitely malicious). " +
      'Use for threshold questions like "links scoring under 20" or "score above 80".',
    ops: ["gte", "lte", "gt", "lt", "eq"],
  },
  confidence: {
    column: "aiConfidence", table: "indicator", type: "enum",
    describe: 'How confident the AI was in its verdict: "low", "medium", or "high". Low-confidence ' +
      'items are the ones most worth a human look. Use for "how many low-confidence verdicts".',
    values: ["low", "medium", "high"],
    ops: ["eq"],
  },
  channel: {
    column: "source", table: "submission", type: "enum",
    describe: 'How the report arrived: "web" (checked on the site/extension) or "email" (forwarded ' +
      'to the Orbis inbox). Use for "how many came from email" or "web vs email split".',
    values: ["web", "email"],
    ops: ["eq"],
  },
  attackType: {
    column: "aiTags", table: "indicator", type: "tag",
    describe: "The attack-type category the AI tagged the link with — e.g. \"Credential phishing\", " +
      '"Brand impersonation", "Business email compromise", "Malware", "Social engineering". ' +
      'Use for "how many credential-phishing links" or "top attack types". Free-text: pass the ' +
      "category the user names; it is matched case-insensitively against the stored tags.",
    ops: ["eq"],
  },
  blacklisted: {
    column: "blacklistHit", table: "indicator", type: "boolean",
    describe: "Whether Google Safe Browsing flagged the link as known-bad (true/false). " +
      'Use for "how many blacklisted links". NOTE: only populated when the Safe Browsing key is ' +
      "configured; may be all-false on a keyless deploy.",
    ops: ["eq"],
  },
  domainAge: {
    column: "domainAgeDays", table: "indicator", type: "number",
    describe: "Age of the link's domain in days at scan time. Brand-new domains (e.g. < 30 days) " +
      'are a classic phishing signal. Use for "links on domains under 30 days old".',
    ops: ["gte", "lte", "gt", "lt", "eq"],
  },
  redirected: {
    column: "redirectedToDifferentHost", table: "indicator", type: "boolean",
    describe: "Whether the link redirected to a DIFFERENT host than the one submitted (true/false) " +
      "— a common cloaking trick. Use for \"how many links redirected somewhere else\".",
    ops: ["eq"],
  },
  reviewStatus: {
    column: "reviewStatus", table: "orgReview", type: "enum",
    describe: "The analyst triage state of a report in YOUR org's review queue: \"pending review\" " +
      '(awaiting an analyst), "investigating", "confirmed malicious", or "confirmed safe". This is ' +
      'the same source as the dashboard\'s "Pending Review" tile. Use for "how many pending review" ' +
      'or "what\'s in the triage queue".',
    values: ["pending review", "investigating", "confirmed malicious", "confirmed safe"],
    ops: ["eq"],
  },
  reporter: {
    column: "userName", table: "submission", type: "string",
    describe: "The name of the teammate who reported a link. Use for \"how many did Anya report\" " +
      'or "who reports the most" (as a group-by). ANALYST-ONLY.',
    ops: ["eq"],
    analystOnly: true,
  },
  reportedAt: {
    column: "createdAt", table: "submission", type: "date",
    describe: "When the report was made (the submission date). This is what \"this week\", \"today\", " +
      '"in the last 30 days", "since July 1" refer to. Always express date filters against this.',
    ops: ["gte", "lte"],
  },
};

// ── METRICS: the shapes of answer the assistant can produce. The LLM picks exactly one. ──
// Each metric lists which dimensions it supports as `filterableBy` and (if it can be sliced)
// `groupableBy`. The service has one builder per `kind`. Keeping metrics explicit (rather than
// letting the LLM freestyle SQL) is what makes every answer auditable + testable.
export const METRICS = {
  count: {
    kind: "count",
    describe: "A single total count of reports/links matching the filters (optionally grouped into " +
      "a breakdown). This is the default for \"how many …\" questions. Returns the number AND the " +
      "matching links behind it. Examples: \"how many reports this week\", \"how many dangerous " +
      "links from email\", \"how many low-confidence phishing links\".",
    filterableBy: ["verdict", "score", "confidence", "channel", "attackType", "blacklisted", "domainAge", "redirected", "reviewStatus", "reporter", "reportedAt"],
    groupableBy: ["verdict", "confidence", "channel", "attackType", "reviewStatus", "reporter"],
  },
  weeklyReport: {
    kind: "report", report: "weekly",
    describe: "The full Weekly Threat Report card: this week's totals by verdict, a day-by-day " +
      "stacked chart, the week's worst threats, and computed findings. Use for \"weekly report\" " +
      "or \"summarize this week\".",
  },
  activityHeatmap: {
    kind: "report", report: "heatmap",
    describe: "A day-of-week × time-of-day heatmap of WHEN reports are submitted (past 30 days). " +
      "Use for \"when are threats most common\" or \"what time of day do we get hit\".",
  },
  attackTypeTrend: {
    kind: "report", report: "trend",
    describe: "A 90-day trend of the top attack types over time (one line per category). Use for " +
      "\"how have attack types trended\" or \"is phishing going up\".",
  },
  campaignTable: {
    kind: "report", report: "campaigns",
    describe: "A table of the org's active threat CAMPAIGNS (analyst-clustered groups of related " +
      "attacks) with size, report count, average score and status. ANALYST-ONLY.",
    analystOnly: true,
  },
  scoreDistribution: {
    kind: "report", report: "distribution",
    describe: "A histogram of all safety scores across the org's links, in ten 0-100 buckets. Use " +
      "for \"score distribution\" or \"how are our scores spread\".",
  },
};

// The LLM must reply with this exact envelope. Documented here so the prompt and the validator
// agree on the shape. `unanswerable` is the model's honest escape hatch for off-topic questions.
//   { "metric": "<one METRIC key>",
//     "filters": [ { "field": "<FIELD key>", "op": "<allowed op>", "value": <string|number|boolean> } ],
//     "groupBy": "<FIELD key or null>" }
// or { "unanswerable": true, "reason": "<one short sentence>" }

// Build the plain-English catalog text handed to the LLM. `role` trims analyst-only entries from a
// member's menu so the model is never even told about data the member can't see. Regenerated per
// request from the tables above, so adding a field/metric automatically updates the prompt.
export const catalogPrompt = (role) => {
  const isAnalyst = role === "analyst";
  const metricLines = Object.entries(METRICS)
    .filter(([, m]) => isAnalyst || !m.analystOnly)
    .map(([key, m]) => `- "${key}": ${m.describe}`);
  const fieldLines = Object.entries(FIELDS)
    .filter(([, f]) => isAnalyst || !f.analystOnly)
    .map(([key, f]) => {
      const vals = f.values ? ` Allowed values: ${f.values.map((v) => `"${v}"`).join(", ")}.` : "";
      const ops = ` Operators: ${f.ops.join(", ")}.`;
      return `- "${key}": ${f.describe}${vals}${ops}`;
    });
  return { metrics: metricLines.join("\n"), fields: fieldLines.join("\n") };
};

// Fields/metrics a given role may reference (used by the validator to reject analyst-only tokens
// if a member's plan somehow names them — belt-and-suspenders on top of trimming the prompt).
export const allowedFields = (role) =>
  Object.fromEntries(Object.entries(FIELDS).filter(([, f]) => role === "analyst" || !f.analystOnly));
export const allowedMetrics = (role) =>
  Object.fromEntries(Object.entries(METRICS).filter(([, m]) => role === "analyst" || !m.analystOnly));
