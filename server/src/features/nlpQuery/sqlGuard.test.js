// ── feature: nlp-query · sqlGuard adversarial tests · owner: Michael ──
// The guard is the security gate for LLM-written SQL, so it gets an ADVERSARIAL suite: every way
// we could think of to escape the v_reports view / read-only rule must be rejected, and ordinary
// analytics must pass. If any "must reject" case ever flips to accepted, the build fails loudly.
import { describe, it, expect } from "vitest";
import { checkSql } from "./sqlGuard.js";

describe("sqlGuard — legitimate analytics PASS", () => {
  const ok = [
    "SELECT count(*) FROM v_reports",
    "SELECT verdict, count(*) AS n FROM v_reports GROUP BY verdict ORDER BY n DESC",
    "SELECT channel, count(*) FROM v_reports WHERE verdict = 'dangerous' GROUP BY channel",
    "SELECT reporter, count(*) FROM v_reports GROUP BY reporter ORDER BY count(*) DESC LIMIT 5",
    "SELECT count(*) FROM v_reports WHERE reported_at >= '2026-07-01' AND confidence = 'low'",
    "SELECT date_trunc('day', reported_at) AS d, count(*) FROM v_reports GROUP BY d",
    "SELECT count(*) FROM v_reports WHERE attack_tags @> '[\"Credential phishing\"]'",
    "SELECT avg(score)::int FROM v_reports WHERE review_status = 'pending review'",
    "SELECT count(*) FROM v_reports;", // a single trailing semicolon is tolerated
  ];
  for (const sql of ok) {
    it(`accepts: ${sql.slice(0, 60)}`, () => {
      const res = checkSql(sql);
      expect(res.ok, res.reason).toBe(true);
    });
  }
});

describe("sqlGuard — attacks and escapes REJECT", () => {
  const bad = [
    ["empty", ""],
    ["null", null],
    ["stacked statement (drop)", "SELECT 1 FROM v_reports; DROP TABLE \"User\""],
    ["stacked statement (delete)", "SELECT 1 FROM v_reports; DELETE FROM \"Submission\""],
    ["UNION to another table", "SELECT verdict FROM v_reports UNION SELECT email FROM \"User\""],
    ["UNION ALL to another table", "SELECT domain FROM v_reports UNION ALL SELECT \"apiKeyHash\" FROM \"User\""],
    ["subquery to another table", "SELECT * FROM v_reports WHERE org_id IN (SELECT id FROM \"Organization\")"],
    ["scalar subquery to another table", "SELECT (SELECT email FROM \"User\" LIMIT 1) FROM v_reports"],
    ["CTE over another table", "WITH x AS (SELECT * FROM \"User\") SELECT * FROM x"],
    ["JOIN to another table", "SELECT * FROM v_reports r JOIN \"User\" u ON u.id = r.reporter_user_id"],
    ["UPDATE", "UPDATE v_reports SET score = 100"],
    ["DELETE", "DELETE FROM v_reports"],
    ["INSERT", "INSERT INTO v_reports (score) VALUES (1)"],
    ["DROP", "DROP VIEW v_reports"],
    ["ALTER", "ALTER TABLE \"User\" DROP COLUMN \"apiKeyHash\""],
    ["TRUNCATE", "TRUNCATE \"Submission\""],
    ["line comment injection", "SELECT * FROM v_reports -- AND org_id = 1"],
    ["block comment injection", "SELECT * /* sneaky */ FROM v_reports"],
    ["pg_catalog system table", "SELECT * FROM pg_catalog.pg_tables"],
    ["information_schema", "SELECT column_name FROM information_schema.columns"],
    ["schema-qualified base table", "SELECT * FROM public.\"User\""],
    ["raw base table (not the view)", "SELECT * FROM \"Submission\""],
    ["gibberish", "not sql at all !!!"],
    ["set then select", "SET ROLE postgres; SELECT * FROM v_reports"],
  ];
  for (const [label, sql] of bad) {
    it(`rejects: ${label}`, () => {
      const res = checkSql(sql);
      expect(res.ok).toBe(false);
      expect(res.reason).toBeTruthy();
    });
  }
});
