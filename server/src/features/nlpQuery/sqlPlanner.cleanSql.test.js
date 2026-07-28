// ── feature: nlp-query · cleanSql regression tests · owner: Michael ──
// Regression guard for a real production break: the LLM wraps its SQL in a ```sql … ``` markdown
// fence (often with stray newlines + a trailing semicolon). The old stripper left mangled
// backticks / a trailing ";", which the SQL guard read as "multiple statements" (or Postgres threw
// a 42601 syntax error at ";"). Every Insights example fell back to "I can only answer from your
// team's threat-report data". These assert the fence + trailing-semicolon are cleanly removed so
// exactly one bare statement reaches the guard.
import { describe, it, expect } from "vitest";
import { cleanSql } from "./sqlPlanner.js";
import { checkSql } from "./sqlGuard.js";

describe("cleanSql — unwraps model markdown fences to bare SQL", () => {
  const cases = [
    ["```sql\nSELECT verdict, count(*) FROM v_reports GROUP BY verdict;\n```", "fenced with sql tag + trailing ;"],
    ["```\nSELECT count(*) FROM v_reports\n```", "bare fence"],
    ["```sql\nSELECT score FROM v_reports ORDER BY score;\n```\n", "fence with trailing newline after close"],
    ["SELECT count(*) FROM v_reports;", "no fence, trailing ; only"],
    ["  SELECT count(*) FROM v_reports  ", "just whitespace"],
  ];
  for (const [raw, label] of cases) {
    it(`cleans: ${label}`, () => {
      const sql = cleanSql(raw);
      expect(sql).not.toMatch(/```/);      // no leftover fence
      expect(sql.trimEnd()).not.toMatch(/;$/); // no trailing semicolon
      // …and the cleaned SQL passes the guard (the whole point — it reaches the DB as one SELECT).
      expect(checkSql(sql).ok, `guard should accept cleaned: ${sql}`).toBe(true);
    });
  }

  it("handles null/empty without throwing", () => {
    expect(cleanSql(null)).toBe("");
    expect(cleanSql("")).toBe("");
  });
});
