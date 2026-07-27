// ── feature: dashboard · ThreatTypesChart · owner: Michael ──
// "Threats You Run Into" — a horizontal Recharts bar chart of the aiTags categories
// that showed up most across the user's RISKY checks (dangerous + review bands).
// This is the single most useful personal insight: it tells someone the KIND of scam
// they keep getting targeted with ("Credential phishing × 4"), not just a raw count.
//
// aiTags is set on every AI verdict, so this is reliable data (no external key needed).
// The parent only renders this card when `types` is non-empty.
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList,
} from "recharts";
import { CHART_COLORS, defaultTooltipStyle } from "../../lib/chartConfig.js";

// A little rotating palette so adjacent bars are visually distinct. We skip the
// green (index 1) so nothing risky is ever colored "safe".
const BAR_COLORS = [CHART_COLORS[3], CHART_COLORS[2], CHART_COLORS[0], CHART_COLORS[4]];

// title/sub default to the personal wording; the member dashboard passes team-wide copy.
const ThreatTypesChart = ({
  types,
  title = "Threats You Run Into",
  sub = "Most common risky-link categories",
}) => {
  // Recharts draws a horizontal bar chart when layout="vertical" and the category
  // axis is the Y axis. Height scales with the number of bars so they never squish.
  const height = Math.max(140, types.length * 40 + 20);

  return (
    <Card>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 2px" }}>{title}</h2>
        <p style={{ color: "var(--text-dim)", fontSize: "0.78em", margin: 0 }}>{sub}</p>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={types} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          {/* Value axis (hidden — the count is drawn on the bar instead). */}
          <XAxis type="number" hide allowDecimals={false} />
          {/* Category axis = the tag labels. Wider so long names ("Credential phishing") fit. */}
          <YAxis
            type="category"
            dataKey="label"
            width={130}
            tick={{ fill: "var(--text)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...defaultTooltipStyle} formatter={(v) => [v, "Times seen"]} cursor={{ fill: "var(--canvas)" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
            {types.map((entry, i) => (
              <Cell key={entry.label} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
            <LabelList dataKey="count" position="right" style={{ fill: "var(--text-dim)", fontSize: 12, fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};

const Card = ({ children }) => (
  <div
    style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      boxShadow: "var(--shadow)",
      padding: 20,
    }}
  >
    {children}
  </div>
);

export default ThreatTypesChart;
