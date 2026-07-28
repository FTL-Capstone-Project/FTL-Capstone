// ── feature: nlp-query · SQL guard (the security gate for LLM-generated SQL) · owner: Michael ──
//
// The natural-language assistant lets an LLM WRITE SQL. That is only safe because every generated
// statement must pass THIS guard before it runs. The guard is deny-by-default: a query is rejected
// unless it is provably a single, read-only SELECT that touches NOTHING but the v_reports view.
//
// Layers (this file is layers 1–2; the executor adds READ ONLY tx + scope predicate + limits):
//   1. Parse with a real SQL parser (node-sql-parser). Unparseable → reject.
//   2. Assert: exactly ONE statement · it's a SELECT · every table it references (incl. via
//      UNION / JOIN / subquery / CTE) is exactly the allowlisted view · no schema-qualified names
//      (blocks pg_catalog/information_schema) · no stacked-statement or block-comment characters.
//
// tableList() from the parser returns one entry per referenced relation as "<op>::<schema>::<name>"
// and — verified empirically — it captures tables inside UNIONs, subqueries, CTEs and JOINs too. So
// "every entry must be select::null::v_reports" is a complete allowlist, not a surface check.
// node-sql-parser is CommonJS; import the default and destructure Parser (a named import fails at
// runtime under ESM even though it type-checks).
import pkg from "node-sql-parser";
const { Parser } = pkg;

const parser = new Parser();
const DIALECT = { database: "postgresql" };

// The ONLY relation an LLM query may read. (A CTE alias the query defines itself is fine — the
// parser lists the CTE's OWN source tables, which must still all be v_reports.)
export const ALLOWED_VIEW = "v_reports";

// Result of a guard check: { ok: true, ast } or { ok: false, reason }.
const reject = (reason) => ({ ok: false, reason });

// Validate an LLM-generated SQL string. Returns { ok, ast?, reason? }. NEVER throws.
export const checkSql = (sql) => {
  if (typeof sql !== "string" || !sql.trim()) return reject("empty query");

  const trimmed = sql.trim();

  // Cheap lexical guards BEFORE parsing — defense in depth against tricks that some parser
  // versions might normalize away. A single trailing ";" is tolerated (stripped below); anything
  // that looks like stacked statements or SQL comments is refused outright.
  const withoutTrailingSemi = trimmed.replace(/;\s*$/, "");
  if (withoutTrailingSemi.includes(";")) return reject("multiple statements are not allowed");
  if (/--/.test(withoutTrailingSemi) || /\/\*/.test(withoutTrailingSemi)) {
    return reject("SQL comments are not allowed");
  }

  // Parse. A syntax error (or anything the parser can't represent) is a rejection, not a crash.
  let ast;
  let tables;
  try {
    ast = parser.astify(withoutTrailingSemi, DIALECT);
    tables = parser.tableList(withoutTrailingSemi, DIALECT); // ["op::schema::name", ...]
  } catch (e) {
    return reject(`unparseable SQL: ${String(e.message || e).slice(0, 80)}`);
  }

  // Exactly one statement.
  if (Array.isArray(ast)) {
    if (ast.length !== 1) return reject("exactly one statement is allowed");
    ast = ast[0];
  }

  // Must be a SELECT (blocks UPDATE/DELETE/INSERT/DROP/ALTER/CREATE/TRUNCATE/etc.).
  if (!ast || ast.type !== "select") return reject(`only SELECT is allowed (got ${ast?.type ?? "unknown"})`);

  // Every referenced relation must be a SELECT against exactly the allowlisted view, with NO
  // schema qualifier (so "pg_catalog.pg_tables" / "information_schema.columns" are rejected).
  for (const entry of tables) {
    const [op, schema, name] = String(entry).split("::");
    if (op !== "select") return reject(`only read operations allowed (found ${op})`);
    // A CTE the query defines itself appears as its alias; allow it ONLY if its own sources were
    // already checked (they appear as separate entries and must be v_reports). We enforce that by
    // requiring the FINAL resolved name to be either the view or a self-defined alias whose
    // sources are all v_reports — simplest safe rule: the name must equal the view. CTE aliases
    // that shadow are rare from an LLM and not worth the risk, so we reject anything else.
    if (name !== ALLOWED_VIEW) return reject(`only the ${ALLOWED_VIEW} view may be queried (found "${schema ? schema + "." : ""}${name}")`);
    if (schema && schema !== "null") return reject(`schema-qualified names are not allowed (found "${schema}.${name}")`);
  }

  return { ok: true, ast };
};
