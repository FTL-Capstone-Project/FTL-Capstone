// ── shared Recharts config · owner: Michael ──
// One place for chart colors and default props so every chart in the app
// uses the same palette and reads the same CSS tokens.
//
// Usage:
//   import { CHART_COLORS, defaultAxisProps, defaultTooltipProps } from "../../lib/chartConfig.js";
//
// The COLORS array matches the theme tokens in client/src/theme/tokens.css.
// Verdict colors (safe/review/danger) line up with the existing hand-built
// SVG charts (ResultsDonut, SubmissionHistoryChart) so the two chart styles
// look consistent on the same screen.

export const CHART_COLORS = [
  "var(--primary)",   // Trust Blue  — bars, lines, default series
  "var(--safe)",      // green       — safe verdict
  "var(--review)",    // amber       — suspicious/review verdict
  "var(--danger)",    // red         — dangerous verdict
  "var(--ring)",      // cyan        — 5th series / accent
];

// Verdict-specific lookup so a pie/bar slice can be colored by verdict name.
export const VERDICT_COLOR = {
  safe:      "var(--safe)",
  review:    "var(--review)",
  dangerous: "var(--danger)",
};

// Default props for XAxis / YAxis — keeps font + color consistent.
export const defaultAxisProps = {
  stroke: "var(--text-dim)",
  tick: { fill: "var(--text-dim)", fontSize: 12 },
  axisLine: { stroke: "var(--border)" },
  tickLine: false,
};

// Default Tooltip style — matches the card surface.
export const defaultTooltipStyle = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--text)",
  },
  cursor: { fill: "var(--canvas)" },
};
