// ── feature: nlp-query · schema-sync guard · owner: Michael ──
// The catalog (the "form") declares a real Prisma column for every field. If the data model
// changes and a column is renamed/removed, this test FAILS — so the form can never silently drift
// out of sync with the database (which would make the LLM offer data that no longer exists, or a
// query blow up at runtime). This is the "update the form whenever the data updates" safety net,
// enforced by CI instead of memory.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FIELDS } from "./catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "../../prisma/schema.prisma"), "utf8");

// Columns that are DERIVED in the service rather than being a literal Prisma column, so they
// legitimately won't appear in schema.prisma. Keep this list tiny and explained.
const DERIVED_COLUMNS = new Set([
  "userName", // alias for submission.user.name (a relation hop), resolved in the query builder
]);

// Which Prisma model each catalog `table` maps to, so we can check the column under the right model.
const TABLE_TO_MODEL = { indicator: "Indicator", submission: "Submission", orgReview: "OrgReview" };

// Extract the field names declared inside a `model X { ... }` block.
const modelFields = (modelName) => {
  const m = schema.match(new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) return new Set();
  return new Set(
    m[1]
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0]) // first token on each line = field name
      .filter((name) => name && /^[a-zA-Z]/.test(name))
  );
};

describe("catalog ↔ schema sync (the form can't drift from the database)", () => {
  it("every catalog field maps to a real column on its declared model", () => {
    for (const [key, f] of Object.entries(FIELDS)) {
      if (DERIVED_COLUMNS.has(f.column)) continue;
      const model = TABLE_TO_MODEL[f.table];
      expect(model, `field "${key}" has unknown table "${f.table}"`).toBeDefined();
      const cols = modelFields(model);
      expect(
        cols.has(f.column),
        `catalog field "${key}" → ${model}.${f.column} is not a column in schema.prisma ` +
          `(did the data model change? update catalog.js)`
      ).toBe(true);
    }
  });

  it("every enum field's allowed values are a closed set (so the LLM can't invent one)", () => {
    for (const [key, f] of Object.entries(FIELDS)) {
      if (f.type === "enum" || f.type === "verdictBand") {
        expect(Array.isArray(f.values) && f.values.length > 0, `"${key}" must declare values`).toBe(true);
      }
    }
  });
});
