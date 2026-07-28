// ── feature: dashboard · AnalystDashboard · owner: Michael ──
// Org-wide analyst dashboard variant. Fetches GET /api/history (the analyst stats
// endpoint built in G2·02) and renders, inside the SAME two-column shell every
// dashboard variant uses (main content + a 300px right rail):
//   tiles     : Pending Review, Threats This Week, Reviewed This Week, AI Agreement
//   charts    : 7-day submission trend (BarChart) + verdict distribution (PieChart)
//   intel     : threat types + top-targeted hosts
//   analytics : review insights (calibration / turnaround / shared rate) + AI-confidence mix
//   coverage  : top reporters + org-wide red flags & channels (reuses SafetySignals)
//   queue     : pending-review list (oldest-first)
//   right rail: Team Activity feed + the shared Ask Orbo chat space (ActivityRail)
//
// Uses Recharts (added in G2·01) for the charts; the personal charts are hand-built
// SVG/CSS and stay unchanged. The right rail + Page/Card frames match the personal and
// member variants so all three read as one layout.
import { useEffect, useState } from "react";
import { Scale, Timer, Share2 } from "lucide-react";
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
import ThreatTypesChart from "./ThreatTypesChart.jsx";
import SafetySignals from "./SafetySignals.jsx";
import ActivityRail from "./ActivityRail.jsx";
import StatusChip from "../reports/StatusChip.jsx";
import { useStableToken } from "../../lib/useStableToken.js";

// ── AnalystDashboard ────────────────────────────────────────────────────────
const AnalystDashboard = () => {
  const getToken = useStableToken();
  const [data, setData] = useState(null);   // { stats, recent, activity }
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

  const { stats, recent, activity = [] } = data;
  const {
    verdictBreakdown, trend, pendingCount,
    oldestPendingDays = 0, threatsThisWeek, reviewedThisWeek,
    aiAgreement = null, scoreCalibration = null, avgTurnaroundDays = null,
    sharedRate = null, topTargeted = [], threatTypes = [],
    confidenceMix = { high: 0, medium: 0, low: 0, unknown: 0 },
    topReporters = [], redFlags = {}, channels = {},
  } = stats;

  // PieChart data: map verdict bands to chart slices.
  const verdictPie = [
    { name: "Safe",       value: verdictBreakdown.safe,      color: VERDICT_COLOR.safe },
    { name: "Review",     value: verdictBreakdown.review,    color: VERDICT_COLOR.review },
    { name: "Dangerous",  value: verdictBreakdown.dangerous, color: VERDICT_COLOR.dangerous },
  ].filter((s) => s.value > 0); // hide zero-count slices

  // Total unique checks the org has EVER run. We use this so a card whose specific slice is
  // empty (e.g. no RISKY links, no DANGEROUS hosts) can say "all N were safe" instead of the
  // misleading "nothing here yet" — which reads as "the org has done nothing" when it hasn't.
  const totalChecks = verdictBreakdown.total ?? 0;
  const hasChecks = totalChecks > 0;

  // Pending queue sorted OLDEST-first so the most stale item is triaged next.
  // (recent is the org's last 10 submissions; we sort a copy, newest→oldest reversed.)
  const queue = [...recent].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return (
    <Page>
      <h1 style={{ color: "var(--navy)", margin: "0 0 20px" }}>Analyst Dashboard</h1>

      {/* Two columns: main content + right activity rail (rail drops below on narrow screens). */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          {/* ── Stat tiles ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 16,
            }}
          >
            <StatTile
              label="Pending Review"
              value={pendingCount}
              sub={pendingCount === 0 ? "Queue clear" : `Oldest ${oldestPendingDays}d — triage next`}
            />
            <StatTile
              label="Threats This Week"
              value={threatsThisWeek?.value ?? verdictBreakdown.dangerous}
              trend={threatsThisWeek?.trend}
              // When this week is quiet but the org HAS caught threats before, say so — a bare
              // "0" with no context reads as "we've never seen a threat", which isn't true.
              sub={
                (threatsThisWeek?.value ?? 0) === 0 && verdictBreakdown.dangerous > 0
                  ? `${verdictBreakdown.dangerous} flagged all-time`
                  : threatsThisWeek ? undefined : "Dangerous verdict"
              }
            />
            <StatTile
              label="Reviewed This Week"
              value={reviewedThisWeek?.value ?? 0}
              trend={reviewedThisWeek?.trend}
            />
            <StatTile
              label="AI Agreement"
              value={aiAgreement == null ? "—" : `${aiAgreement.pct}%`}
              sub={aiAgreement == null ? "No analyst-scored reviews yet" : `Matches your verdict (${aiAgreement.sample} reviewed)`}
            />
          </div>

          {/* ── Charts row ──
              All the two-column rows below use minmax(0, 1fr), not a bare "1fr 1fr". A 1fr track
              is minmax(auto, 1fr), and that `auto` floor is the child's min-content width — a
              Recharts ResponsiveContainer reports one, so a 1fr column can't shrink, the row grows
              wider than <main>, and the whole page scrolls sideways. minmax(0, …) drops the floor
              to 0 so the columns fit (same fix as the outer minmax(0, 1fr) 300px grid). */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            {/* 30-day submission trend (matches the personal dashboard's window). */}
            <Card title="Submission Trend" sub="Past 30 days">
              {trend.every((d) => d.count === 0) ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No submissions in the last 30 days.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <XAxis dataKey="date" {...defaultAxisProps}
                      interval="preserveStartEnd" minTickGap={24}
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
                      {verdictPie.map((entry) => (
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

          {/* ── Threat intel row: what categories + which hosts are being weaponized ── */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            {threatTypes.length > 0 ? (
              <ThreatTypesChart
                types={threatTypes}
                title="Threat Types"
                sub="Categories across risky org submissions"
              />
            ) : (
              <Card title="Threat Types" sub="Categories across risky org submissions">
                <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>
                  {hasChecks
                    ? `Good news — all ${totalChecks} checked link${totalChecks === 1 ? "" : "s"} came back safe, so there are no threat categories to show.`
                    : "No checks yet — threat categories will appear once your team runs some."}
                </p>
              </Card>
            )}

            <Card title="Top Targeted" sub="Hosts dangerous links land on">
              {topTargeted.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>
                  {hasChecks
                    ? "No dangerous links so far — nothing your team checked landed on a flagged host."
                    : "No checks yet — targeted hosts will appear once your team runs some."}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, topTargeted.length * 40 + 20)}>
                  <BarChart data={topTargeted} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category" dataKey="domain" width={140}
                      tick={{ fill: "var(--text)", fontSize: 12 }} axisLine={false} tickLine={false}
                    />
                    <Tooltip {...defaultTooltipStyle} formatter={(v) => [v, "Dangerous hits"]} cursor={{ fill: "var(--canvas)" }} />
                    <Bar dataKey="count" fill={VERDICT_COLOR.dangerous} radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* ── Analyst analytics row: review health (text) + AI-confidence mix ── */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            <ReviewInsights
              calibration={scoreCalibration}
              turnaroundDays={avgTurnaroundDays}
              sharedRate={sharedRate}
            />
            <ConfidenceMix mix={confidenceMix} />
          </div>

          {/* ── Coverage row: who's reporting + org-wide deterministic signals & channels ── */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            <TopReporters reporters={topReporters} />
            <SafetySignals redFlags={redFlags} channels={channels} />
          </div>

          {/* ── Pending-review queue (oldest-first) ── */}
          <Card title="Pending Review" sub={`${pendingCount} item${pendingCount === 1 ? "" : "s"} awaiting verdict — oldest first`}>
            {queue.length === 0 ? (
              <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No recent activity.</p>
            ) : (
              <div style={{ display: "grid", gap: 0 }}>
                {queue.map((item, i) => (
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
                    {/* Sandbox screenshot thumbnail; falls back to a grey block when urlscan
                        gave us no image (keyless deploy, email-only report, or older row). */}
                    <Thumbnail src={item.screenshotUrl} alt={item.title} />

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
                      {/* Real review state (pending / investigating / confirmed …), not a hardcoded pill. */}
                      <StatusChip status={item.reviewStatus} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail: team activity feed + Ask Orbo chat space (shared across all variants). */}
        <ActivityRail activity={activity} title="Team Activity" role="analyst" />
      </div>
    </Page>
  );
};

// ── Analyst-only cards ──────────────────────────────────────────────────────

// Review health, in plain English. These three review-derived stats read better as
// sentences than as bare tiles: each one only means something WITH its "vs the AI" /
// "per review" framing. Every stat is null until the org has closed/scored a review,
// so each row falls back to a short "not enough data yet" line instead of a fake 0.
const ReviewInsights = ({ calibration, turnaroundDays, sharedRate }) => {
  // Calibration is signed: +delta = the team scores items SAFER than the AI, −delta = STRICTER.
  const calibrationText = () => {
    if (!calibration) return "Score a review to compare your severity with the AI's.";
    const d = calibration.avgDelta;
    if (Math.abs(d) < 1) return `Your scores closely match the AI's (across ${calibration.sample} reviewed).`;
    const dir = d > 0 ? "more lenient than" : "stricter than";
    return `Your team scores ~${Math.abs(d)} pts ${dir} the AI (across ${calibration.sample} reviewed).`;
  };
  const turnaroundText = () =>
    turnaroundDays == null
      ? "No closed reviews yet to time."
      : turnaroundDays < 1
        ? "Reviews close in under a day on average — fast turnaround."
        : `Reviews take ~${turnaroundDays} day${turnaroundDays === 1 ? "" : "s"} to close on average.`;
  const sharedText = () =>
    !sharedRate
      ? "Share a closed verdict to let your team see it."
      : `You've shared ${sharedRate.pct}% of closed verdicts (${sharedRate.shared} of ${sharedRate.closed}) with the team.`;

  const rows = [
    { Icon: Scale, color: "var(--primary)", title: "Score calibration", body: calibrationText() },
    { Icon: Timer, color: "var(--review)", title: "Review turnaround", body: turnaroundText() },
    { Icon: Share2, color: "var(--ring)", title: "Shared with team", body: sharedText() },
  ];

  return (
    <Card title="Review Insights" sub="How your team's reviews stack up">
      <div style={{ display: "grid", gap: 14 }}>
        {rows.map(({ Icon, color, title, body }) => (
          <div key={title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span
              style={{
                width: 30, height: 30, flexShrink: 0, borderRadius: 8,
                background: "var(--canvas)", display: "grid", placeItems: "center", color,
              }}
            >
              <Icon size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.85em", fontWeight: 700, color: "var(--navy)" }}>{title}</div>
              <div style={{ fontSize: "0.82em", color: "var(--text-dim)", lineHeight: 1.45 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// AI-confidence spread across the org's checks. A single proportional bar (high→low) plus
// a legend. Low-confidence verdicts are the ones an analyst should eyeball first, so the
// sub-line calls out that count when there is one. `unknown` (no aiConfidence stored) is
// folded into the bar so the segments always sum to the total.
const ConfidenceMix = ({ mix }) => {
  const segments = [
    { key: "high", label: "High", count: mix.high ?? 0, color: "var(--safe)" },
    { key: "medium", label: "Medium", count: mix.medium ?? 0, color: "var(--review)" },
    { key: "low", label: "Low", count: mix.low ?? 0, color: "var(--danger)" },
    { key: "unknown", label: "Unrated", count: mix.unknown ?? 0, color: "var(--border)" },
  ].filter((s) => s.count > 0);
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const lowCount = mix.low ?? 0;

  return (
    <Card
      title="AI Confidence Mix"
      sub={lowCount > 0 ? `${lowCount} low-confidence — these most need your eyes` : "How sure the AI was across checks"}
    >
      {total === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No checks yet.</p>
      ) : (
        <>
          {/* Single proportional bar: high → low → unrated. */}
          <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--border)" }}>
            {segments.map((s) => (
              <div key={s.key} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
            ))}
          </div>
          {/* Legend with counts. */}
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {segments.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85em" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                <span style={{ color: "var(--text)" }}>{s.label} confidence</span>
                <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--navy)" }}>{s.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

// Who on the team is surfacing the most links. A simple ranked list — the top reporter's
// count sets the bar width so the rest read as relative contribution.
const TopReporters = ({ reporters }) => {
  const max = reporters.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <Card title="Top Reporters" sub="Who's surfacing the most links">
      {reporters.length === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No reports yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {reporters.map((r) => (
            <div key={r.name} style={{ display: "grid", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85em" }}>
                <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ fontWeight: 800, color: "var(--navy)", flexShrink: 0, marginLeft: 8 }}>{r.count}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ width: `${max === 0 ? 0 : (r.count / max) * 100}%`, height: "100%", background: "var(--primary)", borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// Queue-row screenshot thumbnail. Shows the real urlscan image when we have one and it
// loads; on a missing URL OR a broken/expired image it renders the same grey block as
// before, so a bad screenshot never leaves a broken-image icon in the queue.
const Thumbnail = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  const box = { width: 52, height: 38, flexShrink: 0, borderRadius: 6, overflow: "hidden" };
  if (!src || failed) {
    return <div style={{ ...box, background: "var(--border)" }} />;
  }
  return (
    <img
      src={src}
      alt={alt ? `Screenshot of ${alt}` : "Link screenshot"}
      onError={() => setFailed(true)}
      style={{ ...box, objectFit: "cover", objectPosition: "top", border: "1px solid var(--border)" }}
    />
  );
};

// ── Shared sub-components (match personal/member Page + Card frames) ─────────

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
