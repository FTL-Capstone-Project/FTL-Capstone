// ── feature: insights · TrendChart · owner: Ozias ──
// "90-Day Threat Trend by Attack Type" — a multi-series line chart, one line per attack type
// (credential phishing, email impersonation, …), so an analyst can see which kind of attack is
// climbing. This is the first chart in the app with MORE THAN ONE series, which is why the
// series names arrive in chartSpec instead of being hardcoded: the data decides the lines.
//
// Data comes from chartSpec.type === "trend":
//   data      = [{ label: "Apr 6", "Credential phishing": 3, "Social engineering": 1 }, …]
//   chartSpec = { series: ["Credential phishing", …], deltas: [{ label, pct, direction }], subtitle }
//
// Each bucket carries EVERY series key (the server fills zeros), so Recharts draws continuous
// lines instead of breaking wherever a type had a quiet week.
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CHART_COLORS, defaultAxisProps, defaultTooltipStyle } from "../../../lib/chartConfig.js";
import EmptyChart from "./EmptyChart.jsx";

// An "up" trend in threat volume is BAD news, so rising = danger red and falling = safe green.
// (The opposite of a finance chart — worth being explicit about.)
const DIRECTION_STYLE = {
  up:   { color: "var(--danger)", Icon: TrendingUp },
  down: { color: "var(--safe)",   Icon: TrendingDown },
  flat: { color: "var(--review)", Icon: Minus },
};

// "↑ 41%" / "→ Stable" — the wireframe's per-type summary row.
const DeltaChip = ({ delta }) => {
  const { color, Icon } = DIRECTION_STYLE[delta.direction] ?? DIRECTION_STYLE.flat;
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ color: "var(--text-dim)", fontSize: "0.72em", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {delta.label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color, fontWeight: 700, fontSize: "1.05em" }}>
        <Icon size={16} />
        {delta.direction === "flat" ? "Stable" : `${delta.pct}%`}
      </div>
    </div>
  );
};

const TrendChart = ({ data, chartSpec }) => {
  const { series, deltas, subtitle } = chartSpec;

  // With no tagged submissions there are no series, so Recharts would draw empty axes and an
  // empty legend. `series` being empty is the real signal — data buckets can exist while every
  // count is zero.
  if (chartSpec.empty || !series?.length || data.length === 0) {
    return <EmptyChart message="No tagged submissions in the last 90 days, so there's no trend to chart yet." />;
  }

  return (
    <div>
      {subtitle && (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "0 0 16px" }}>{subtitle}</p>
      )}

      {/* per-attack-type change over the window (computed server-side, not by the AI) */}
      {deltas?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 20 }}>
          {deltas.map((delta) => <DeltaChip key={delta.label} delta={delta} />)}
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <XAxis dataKey="label" {...defaultAxisProps} />
          <YAxis allowDecimals={false} {...defaultAxisProps} />
          <Tooltip {...defaultTooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-dim)" }} />
          {series.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendChart;
