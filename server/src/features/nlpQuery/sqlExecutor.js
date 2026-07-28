// ── feature: nlp-query · scoped read-only SQL executor · owner: Michael ──
//
// Layers 3–4 of the SQL-safety design (layers 1–2 are sqlGuard.js). Given SQL the guard has
// already proven to be a single read-only SELECT over ONLY the v_reports view, this runs it so:
//
//   • SCOPE IS STRUCTURAL, not the LLM's job. We prepend a CTE named `v_reports` that pre-filters
//     the real view to the caller's scope with a PARAMETERIZED bind ($1 orgId, + the member
//     visibility rule). Inside the query, `v_reports` resolves to that scoped CTE (Postgres CTEs
//     shadow a same-named view), so the model's references can only ever see in-scope rows — there
//     is no SQL it can write to widen the scope, because the filter isn't in its SQL at all.
//   • READ ONLY: the whole thing runs in a `SET TRANSACTION READ ONLY` block, so even a guard miss
//     could not write.
//   • BOUNDED: a short statement_timeout kills a runaway query; a hard row LIMIT caps output.
//
// MEMBER PRIVACY GATE: an analyst sees the whole org (org_id = $1). A member sees only rows they
// reported OR rows their org analyst-shared (shared_with_org = true) — the same rule as Team
// History, expressed as an extra parameterized predicate on the scoped CTE.
import { prisma } from "../../db.js";

const ROW_LIMIT = 500;         // hard cap on returned rows (an aggregation is tiny; this guards a stray raw pull)
const STATEMENT_TIMEOUT_MS = 4000; // kill any query that runs longer than this

// Build the scoped-CTE prefix + its bind params for the caller. Analyst → org-wide; member →
// own-reported ∪ analyst-shared. The predicate is 100% parameterized ($1..$n); no value is
// interpolated into SQL text.
const scopeCte = (scope) => {
  const { orgId, userId, role } = scope;
  if (role === "analyst") {
    return {
      cte: `WITH v_reports AS (SELECT * FROM v_reports WHERE org_id = $1)`,
      params: [orgId],
    };
  }
  // Member: org-scoped AND (reported by them OR analyst-shared).
  return {
    cte: `WITH v_reports AS (SELECT * FROM v_reports WHERE org_id = $1 AND (reporter_user_id = $2 OR shared_with_org = true))`,
    params: [orgId, userId],
  };
};

// Run guard-approved SQL under the caller's scope. Returns { rows } or throws (caller maps to a
// friendly message). `innerSql` MUST have passed sqlGuard.checkSql first — this does not re-parse.
export const runScopedSql = async (innerSql, scope) => {
  const { cte, params } = scopeCte(scope);
  // The model's SELECT becomes the main query after our scoped CTE. We also wrap it once more in a
  // LIMIT so even a query that forgot one can't return an unbounded result set.
  const finalSql = `${cte} SELECT * FROM ( ${innerSql} ) AS _q LIMIT ${ROW_LIMIT}`;

  // One interactive transaction: force READ ONLY + a statement timeout, then run the query. If
  // anything tries to write, Postgres aborts it; if it runs too long, the timeout aborts it.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET TRANSACTION READ ONLY`);
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const rows = await tx.$queryRawUnsafe(finalSql, ...params);
    return { rows };
  });
};

export const SQL_LIMITS = { ROW_LIMIT, STATEMENT_TIMEOUT_MS };
