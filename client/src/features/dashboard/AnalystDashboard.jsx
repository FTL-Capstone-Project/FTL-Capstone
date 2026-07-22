// ── feature: dashboard · AnalystDashboard · owner: Michael ──
// Org-wide analyst dashboard variant. Fetches GET /api/history (the analyst stats
// endpoint built in G2·02) and renders:
//   top row   : 3 stat tiles (total checks, threats detected, pending review)
//   charts    : 7-day submission trend (Recharts BarChart) + verdict distribution (PieChart)
//   bottom    : pending-review queue (reuses StatusChip for review_status badges)
//   (ActivityRail / Ask Orbo mini-box are on the right rail shared with personal)
//
// Uses Recharts (added in G2·01) for the charts; the existing personal charts are
// hand-built SVG/CSS and stay unchanged.
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { api } from "../../lib/api.js";
import {
  CHART_COLORS, VERDICT_COLOR,
  defaultAxisProps, defaultTooltipStyle,
} from "../../lib/chartConfig.js";
import StatTile from "./StatTile.jsx";
import StatusChip from "../reports/StatusChip.jsx";

// ── AnalystDashboard ────────────────────────────────────────────────────────
const AnalystDashboard = () => {
  const { getToken } = useAuth();
  const [data, setData] = useState(null);   // { stats, recent }
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/history", { getToken })
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [getToken]);

  if (error) {
    return (
      <Page>
        <p style={{ color: "var(--text-dim)" }}>Couldn't load dashboard. Please try again.</p>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page>
        <p style={{ color: "var(--text-dim)" }}>Loading org dashboard…</p>
      </Page>
    );
  }

  const { stats, recent } = data;
  const { verdictBreakdown, trend, pendingCount } = stats;

  // PieChart data: map verdict bands to chart slices.
  const verdictPie = [
    { name: "Safe",       value: verdictBreakdown.safe,      color: VERDICT_COLOR.safe },
    { name: "Review",     value: verdictBreakdown.review,    color: VERDICT_COLOR.review },
    { name: "Dangerous",  value: verdictBreakdown.dangerous, color: VERDICT_COLOR.dangerous },
  ].filter((s) => s.value > 0); // hide zero-count slices

  return (
    <Page>
      <h1 style={{ color: "var(--navy)", margin: "0 0 20px" }}>Analyst Dashboard</h1>

      {/* ── Stat tiles ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatTile
          label="Total Checks"
          value={verdictBreakdown.total}
          sub="All-time org submissions"
        />
        <StatTile
          label="Threats Detected"
          value={verdictBreakdown.dangerous}
          sub="Dangerous verdict"
        />
        <StatTile
          label="Pending Review"
          value={pendingCount}
          sub="Awaiting analyst verdict"
        />
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* 7-day submission trend */}
        <Card title="Submission Trend" sub="Past 7 days">
          {trend.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No submissions this week.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="date" {...defaultAxisProps}
                  tickFormatter={(v) => v.slice(5)} // "07-15" from "2026-07-15"
                />
                <YAxis {...defaultAxisProps} allowDecimals={false} />
                <Tooltip {...defaultTooltipStyle} formatter={(v) => [v, "Submissions"]} />
                <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Verdict distribution */}
        <Card title="Verdict Distribution" sub="All org submissions">
          {verdictPie.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No verdicts yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={verdictPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={80}
                  strokeWidth={0}
                >
                  {verdictPie.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...defaultTooltipStyle} />
                <Legend
                  iconType="circle"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 13, color: "var(--text-dim)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Pending-review queue ── */}
      <Card title="Pending Review" sub={`${pendingCount} item${pendingCount === 1 ? "" : "s"} awaiting verdict`}>
        {recent.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No recent activity.</p>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {recent.map((item, i) => (
              <div
                key={item.indicatorId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                {/* Screenshot placeholder */}
                <div style={{ width: 52, height: 38, flexShrink: 0, borderRadius: 6, background: "var(--border)" }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--navy)", fontSize: "0.9em",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: "0.78em", color: "var(--text-dim)" }}>
                    {item.reporter ? `Reported by ${item.reporter}` : item.domain}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "0.68em", fontWeight: 700, letterSpacing: "0.04em",
                    color: "var(--text-dim)", textTransform: "uppercase" }}>Score</div>
                  <div style={{ fontWeight: 800, fontSize: "0.95em",
                    color: item.kind === "safe" ? "var(--safe)" :
                           item.kind === "dangerous" ? "var(--danger)" : "var(--review)" }}>
                    {item.score == null ? "—" : `${item.score}/100`}
                  </div>
                </div>

                <div style={{ flexShrink: 0, minWidth: 120, display: "flex", justifyContent: "flex-end" }}>
                  <StatusChip status="pending review" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
};

// ── Shared sub-components ───────────────────────────────────────────────────

const Page = ({ children }) => (
  <div style={{ maxWidth: 1080, margin: "40px auto", padding: "0 24px" }}>
    {children}
  </div>
);

const Card = ({ title, sub, children }) => (
  <div
    style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      boxShadow: "var(--shadow)",
      padding: 20,
    }}
  >
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 2px" }}>{title}</h2>
      {sub && <p style={{ color: "var(--text-dim)", fontSize: "0.78em", margin: 0 }}>{sub}</p>}
    </div>
    {children}
  </div>
);

export default AnalystDashboard;
