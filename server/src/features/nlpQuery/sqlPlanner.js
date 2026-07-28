// ── feature: nlp-query · SQL planner + result formatter · owner: Michael ──
//
// The capable path: the LLM writes ordinary SQL against the v_reports view, so ANY combination of
// filter × grouping × aggregation the view supports is answerable without us pre-building it. The
// model only ever sees the VIEW's column catalog (below) — never the raw tables — and its SQL must
// pass sqlGuard + run through the scoped, read-only executor. Rows come back as exact numbers from
// Postgres; a DETERMINISTIC formatter (not the LLM) shapes them into the existing chartSpec shapes,
// so the model can neither miscount nor leak a value.
import { chatText } from "../../services/llm.js";
import { checkSql } from "./sqlGuard.js";
import { runScopedSql } from "./sqlExecutor.js";

// The view's shareable columns, described for the LLM. This is the SQL-path counterpart to
// catalog.js — same "the model reads a form" idea, but the form is now the view's columns and the
// model writes SQL instead of a JSON plan. Keep in sync with the v_reports migration.
const VIEW_COLUMNS = `v_reports — one row per reported link/email. Columns:
  reported_at   timestamptz  — when it was reported (use for "this week", "today", date ranges)
  channel       text         — 'web' | 'email' (how it was reported)
  verdict       text         — 'safe' | 'suspicious' | 'dangerous' (AI safety band)
  score         int          — 0-100 safety score (100 = safe, 0 = malicious); may be NULL
  confidence    text         — 'low' | 'medium' | 'high' (AI confidence); may be NULL
  title         text         — short headline for the link
  domain        text         — the link's domain
  final_host    text         — where it actually landed (may be NULL)
  attack_tags   jsonb        — array of category strings, e.g. ["Credential phishing"]; use @> '["X"]' to filter
  domain_age_days int        — age of the domain in days (NULL if unknown)
  blacklisted   boolean      — flagged by Google Safe Browsing
  redirected    boolean      — redirected to a different host
  reported_count int         — how many users flagged this link (repeat-offender signal)
  review_status text         — analyst triage: 'pending review' | 'investigating' | 'confirmed malicious' | 'confirmed safe' | NULL
  human_score   int          — analyst's authoritative score, if reviewed (NULL otherwise)
  reporter      text         — teammate who reported it (ANALYST QUERIES ONLY; do not select for members)
  indicator_id  int          — the link's id (use COUNT(DISTINCT indicator_id) for "how many links")`;

// System prompt: write ONE read-only SELECT over v_reports. We forbid everything the guard would
// reject anyway, up front, so the model aims correctly the first time.
const sqlSystem = (role, today) =>
  "You are a careful data analyst. Translate the user's question into ONE PostgreSQL SELECT over a " +
  "single view called v_reports. Reply with ONLY the SQL — no prose, no markdown, no semicolon.\n\n" +
  VIEW_COLUMNS + "\n\n" +
  "HARD RULES:\n" +
  "- Exactly ONE statement. SELECT only. Never INSERT/UPDATE/DELETE/DDL.\n" +
  "- Reference ONLY v_reports. No other table, no JO, no UNION, no subquery to another table, no CTE, no SQL comments, no schema-qualified names (no pg_catalog/information_schema).\n" +
  "- Do NOT add org/user filters yourself — scoping is handled for you.\n" +
  `- Today is ${today} (UTC). For "this week" use reported_at >= date '${today}' - interval '7 days'.\n` +
  "- \"How many links/threats\" means COUNT(DISTINCT indicator_id) (a link can be reported many " +
  "times); \"how many reports/submissions\" means COUNT(*).\n" +
  "- For a breakdown, GROUP BY the dimension and SELECT that dimension + the count, aliased clearly.\n" +
  (role === "analyst"
    ? "- You MAY use the reporter column (e.g. group by reporter).\n"
    : "- Do NOT select or filter by reporter (not available to this user).\n") +
  "Return only the SQL.";

// Strip accidental markdown fences / stray prose the model might add around the SQL.
const cleanSql = (text) => {
  let s = String(text ?? "").trim();
  s = s.replace(/^```(?:sql)?/i, "").replace(/```$/,"").trim(); // drop code fences
  return s;
};

// Ask the LLM for SQL, guard it, run it scoped. Returns { rows } or { error } (never throws).
// One corrective retry if the first SQL fails the guard — same pattern as the plan path.
export const answerWithSql = async (question, scope) => {
  const today = new Date().toISOString().slice(0, 10);
  const system = sqlSystem(scope.role, today);

  let sql = cleanSql(await chatText({ system, user: `Question: ${question}`, maxTokens: 300, temperature: 0 }));
  let guard = checkSql(sql);
  if (!guard.ok) {
    // Tell the model exactly why and let it correct once.
    const retry = await chatText({
      system,
      user: `Question: ${question}\n\nYour previous SQL was rejected (${guard.reason}). Return corrected SQL that obeys every HARD RULE.`,
      maxTokens: 300, temperature: 0,
    });
    sql = cleanSql(retry);
    guard = checkSql(sql);
    if (!guard.ok) return { error: "reject", reason: guard.reason };
  }

  try {
    const { rows } = await runScopedSql(sql, scope);
    return { rows, sql };
  } catch (e) {
    console.warn("⚠ nlp-query SQL execution failed:", e.message);
    return { error: "exec", reason: e.message };
  }
};

// ── Deterministic formatter: rows → the existing chartSpec shapes the client already renders ──
// No LLM here — Postgres already computed the numbers, we only choose a shape:
//   • 1 row × 1 numeric column      → a single count card ("count")
//   • many rows × (label + number)  → a breakdown bar ("bar")
//   • otherwise                     → a small table ("table")
// bigint (from COUNT) is coerced to Number so JSON is clean.
const coerce = (v) => (typeof v === "bigint" ? Number(v) : v);
const isNumeric = (v) => typeof v === "number" || typeof v === "bigint";

export const formatRows = (rows, question) => {
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, coerce(v)])));
  const title = titleFromQuestion(question);

  if (clean.length === 0) {
    return { data: [], chartSpec: { type: "bucketCount", title, total: 0, reportTotal: 0, band: null, empty: true } };
  }

  const cols = Object.keys(clean[0]);

  // Single scalar (e.g. SELECT count(*), SELECT avg(score)) → a count card. A one-row/one-column
  // numeric result is always a single figure regardless of the column's alias (count, avg, etc.).
  if (clean.length === 1 && cols.length === 1) {
    const only = clean[0][cols[0]];
    if (only === null || isNumeric(only)) {
      // Round a float average to something readable; leave integers alone.
      const value = typeof only === "number" && !Number.isInteger(only) ? Math.round(only * 10) / 10 : (only ?? 0);
      return { data: [{ label: "Total", value }], chartSpec: { type: "count", title } };
    }
  }

  // A (label, number) breakdown → a bar chart. Find the numeric column + a label column.
  const numCol = cols.find((c) => clean.every((r) => isNumeric(r[c]) || r[c] === null));
  const labelCol = cols.find((c) => c !== numCol);
  if (numCol && labelCol && cols.length <= 3) {
    const data = clean
      .map((r) => ({ label: String(r[labelCol] ?? "—"), value: Number(r[numCol] ?? 0) }))
      .sort((a, b) => b.value - a.value);
    return { data, chartSpec: { type: "bar", title, groupBy: labelCol } };
  }

  // Fallback: a small table of the raw rows (capped) — the client renders columns generically.
  return {
    data: clean.slice(0, 50),
    chartSpec: { type: "table", title, columns: cols },
  };
};

// A readable card title from the question (kept short). The formatter owns this so a title always
// exists even though the LLM only returned SQL.
const titleFromQuestion = (question) => {
  const q = String(question ?? "").trim().replace(/[?.]+$/, "");
  if (!q) return "Result";
  return q.charAt(0).toUpperCase() + q.slice(1, 80);
};
