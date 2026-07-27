// ── feature: insights · WeeklyReport · owner: Ozias ──
// "Weekly Threat Report" — the composite answer: four stat chips, a stacked day-by-verdict bar
// chart, the week's worst threats, and key findings. This is the one variant whose `data` is an
// OBJECT rather than an array, because it's four widgets in one card.
//
// Data comes from chartSpec.type === "report":
//   data = { totals: { total, dangerous, suspicious, safe },
//            daily: [{ label: "M", dangerous, suspicious, safe }] × 7,
//            topThreats: [{ indicatorId, title, tag, aiScore, band }],
//            findings: [{ text, direction: "up"|"down"|"flat", pct }] }
//
// The findings text is COMPUTED on the server (percentChange), not written by the AI — so the
// sentence and the chart can never quote different numbers.
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { VERDICT_COLOR, defaultAxisProps, defaultTooltipStyle } from "../../../lib/chartConfig.js";

// Rising threat volume is bad news, so up = danger red, down = safe green (see TrendChart).
const DIRECTION_STYLE = {
  up:   { color: "var(--danger)", Icon: TrendingUp },
  down: { color: "var(--safe)",   Icon: TrendingDown },
  flat: { color: "var(--text-dim)", Icon: Minus },
};

const StatChip = ({ label, value, color }) => (
  <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--canvas)", border: "1px solid var(--border)" }}>
    <span style={{ color: "var(--text-dim)", fontSize: "0.72em", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {label}:
    </span>{" "}
    <span style={{ fontWeight: 800, color, fontSize: "1.05em" }}>{value}</span>
  </div>
);

const SectionHeading = ({ children }) => (
  <h3 style={{ color: "var(--text-dim)", fontSize: "0.75em", textTransform: "uppercase", letterSpacing: "0.06em", margin: "24px 0 12px" }}>
    {children}
  </h3>
);

const WeeklyReport = ({ data, chartSpec }) => {
  const { totals, daily, topThreats, findings } = data;
  const { subtitle } = chartSpec;

  if (totals.total === 0) {
    return (
      <p style={{ color: "var(--text-dim)" }}>
        No submissions in the last 7 days, so there's nothing to report yet.
      </p>
    );
  }

  return (
    <div>
      {subtitle && (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "0 0 16px" }}>{subtitle}</p>
      )}

      {/* totals */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <StatChip label="Total submissions" value={totals.total} color="var(--navy)" />
        <StatChip label="Dangerous" value={totals.dangerous} color="var(--danger)" />
        <StatChip label="Suspicious" value={totals.suspicious} color="var(--review)" />
        <StatChip label="Safe" value={totals.safe} color="var(--safe)" />
      </div>

      {/* daily stacked bars — same three verdict colours, stacked into one bar per day */}
      <SectionHeading>Daily submissions by verdict</SectionHeading>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={daily}>
          <XAxis dataKey="label" {...defaultAxisProps} />
          <YAxis allowDecimals={false} {...defaultAxisProps} />
          <Tooltip {...defaultTooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-dim)" }} />
          {/* stackId groups the three series into a single bar per day */}
          <Bar dataKey="safe" name="Safe" stackId="verdict" fill={VERDICT_COLOR.safe} />
          <Bar dataKey="suspicious" name="Suspicious" stackId="verdict" fill={VERDICT_COLOR.review} />
          <Bar dataKey="dangerous" name="Dangerous" stackId="verdict" fill={VERDICT_COLOR.dangerous} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* the week's worst links */}
      {topThreats.length > 0 && (
        <>
          <SectionHeading>Top threats this week</SectionHeading>
          <div style={{ display: "grid", gap: 2 }}>
            {topThreats.map((threat) => (
              <div
                key={threat.indicatorId}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0", borderTop: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--navy)", fontSize: "0.9em", flex: 1 }}>
                  {threat.title}
                </span>
                <span style={{ color: "var(--text-dim)", fontSize: "0.85em", flex: 1 }}>{threat.tag}</span>
                <span style={{ fontWeight: 700, color: VERDICT_COLOR[threat.band], fontSize: "0.9em" }}>
                  {threat.aiScore == null ? "—" : `${threat.aiScore}/100`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* computed findings */}
      {findings.length > 0 && (
        <>
          <SectionHeading>Key findings</SectionHeading>
          <div style={{ padding: 16, borderRadius: 12, background: "var(--canvas)", display: "grid", gap: 10 }}>
            {findings.map((finding, i) => {
              const { color, Icon } = DIRECTION_STYLE[finding.direction] ?? DIRECTION_STYLE.flat;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9em", color: "var(--text)" }}>
                  <Icon size={16} color={color} />
                  {finding.text}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyReport;
