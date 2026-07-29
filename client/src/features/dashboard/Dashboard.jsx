// ── feature: dashboard · owner: Michael ──
// Role-router: analysts get the org-wide AnalystDashboard; everyone else gets the
// personal "My Dashboard". The two variants are separate components so they can
// fetch from different endpoints and render different chart sets independently.
import { useEffect, useState } from "react";
import { useApi } from "../../lib/useApi.js";
import { useOrbisRole } from "../../lib/useOrbisRole.js";
import AnalystDashboard from "./AnalystDashboard.jsx";
import MemberDashboard from "./MemberDashboard.jsx";
import StatTile from "./StatTile.jsx";
import SubmissionHistoryChart from "./SubmissionHistoryChart.jsx";
import ResultsDonut from "./ResultsDonut.jsx";
import ThreatTypesChart from "./ThreatTypesChart.jsx";
import SafetySignals from "./SafetySignals.jsx";
import RecentSubmissions from "./RecentSubmissions.jsx";
import DashboardEmpty from "./DashboardEmpty.jsx";
import RetryButton from "../../components/RetryButton.jsx";

const Dashboard = () => {
  const { role } = useOrbisRole();

  // Role split: analysts get the org-wide triage dashboard, members get the team-aware
  // dashboard, and individuals fall through to the personal one below.
  if (role === "analyst") return <AnalystDashboard />;
  if (role === "member") return <MemberDashboard />;

  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  // A named loader so the effect AND the "Try again" button share one path (was an inline effect
  // with no way to retry but a full browser reload). `nonce` re-triggers it on demand.
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    api
      .get("/api/dashboard")
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [api, nonce]);

  if (error) {
    return (
      <Page>
        <p style={{ color: "var(--text-dim)" }}>
          Couldn't load your dashboard.{" "}
          <RetryButton onClick={() => setNonce((n) => n + 1)} />
        </p>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page>
        <p style={{ color: "var(--text-dim)" }}>Loading your safety stats…</p>
      </Page>
    );
  }

  // Brand-new user (no checks yet) → friendly empty state instead of empty charts.
  if (data.results.total === 0) {
    return (
      <Page>
        <h1 style={{ color: "var(--navy)", margin: "0 0 20px" }}>My Dashboard</h1>
        <DashboardEmpty />
      </Page>
    );
  }

  const { stats } = data;

  return (
    <Page>
      <h1 style={{ color: "var(--navy)", margin: "0 0 20px" }}>My Dashboard</h1>

      {/* Single column. Individuals have no team data to query, so there's no Ask Orbo data
          rail here (that lives on the member + analyst dashboards). Their stats stand alone. */}
      <div style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gap: 20 }}>
          {/* Top row: 4 stat tiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 16,
            }}
          >
            <StatTile
              label="My Checks This Week"
              value={stats.checksThisWeek.value}
              trend={stats.checksThisWeek.trend}
            />
            <StatTile
              label="Threats Found"
              value={stats.threatsFound.value}
              trend={stats.threatsFound.trend}
              // "Threats Found" is a THIS-WEEK count. If it's 0 but you've caught threats before,
              // note the all-time total (from the donut) so a quiet week doesn't read as "never".
              sub={
                stats.threatsFound.value === 0 && data.results.dangerous > 0
                  ? `${data.results.dangerous} found all-time`
                  : undefined
              }
            />
            <StatTile
              label="Safe Rate"
              value={stats.safeRate == null ? "—" : `${stats.safeRate}%`}
              sub={stats.safeRate == null ? "Run a check to see this" : "Share of your checks that were safe"}
            />
            <StatTile
              label="Top Threat Type"
              value={stats.topThreatType ?? "None yet"}
              sub={stats.topThreatType ? "What you're targeted with most" : "No threats caught so far"}
            />
          </div>

          {/* Middle: submission-history bars + results donut.
              minmax(0, 1fr) NOT "1fr 1fr": a bare 1fr track is minmax(auto, 1fr), and that `auto`
              floor equals the child's min-content width. A Recharts ResponsiveContainer reports a
              min width, so the track refuses to shrink, the row grows past <main>, and the whole
              page scrolls left/right. minmax(0, …) lets the column shrink to fit (same trick the
              outer .dashboard-shell grid already uses). */}
          <div className="dash-two-col">
            <SubmissionHistoryChart history={data.submissionHistory} />
            <ResultsDonut results={data.results} />
          </div>

          {/* Parsed intelligence: threat categories + deterministic red flags / channels.
              ThreatTypes only renders once the user has actually hit risky links; before
              then we give the red-flags/channels card the full width so there's no empty gap. */}
          {data.threatTypes?.length > 0 ? (
            // minmax(0, 1fr) again — this row holds the ThreatTypesChart, the exact overflow trap.
            <div className="dash-two-col">
              <ThreatTypesChart types={data.threatTypes} />
              <SafetySignals redFlags={data.redFlags} channels={data.channels} />
            </div>
          ) : (
            <SafetySignals redFlags={data.redFlags} channels={data.channels} />
          )}

          {/* Bottom: recent submissions */}
          <RecentSubmissions items={data.recentSubmissions} />
        </div>
      </div>
    </Page>
  );
}

// Shared page frame (centers content, matches Reports' spacing).
// Wider page frame (see .dashboard-page in global.css). Individuals have no rail, so their
// content fills the wider frame single-column; the responsive gutters come from the class.
const Page = ({ children }) => {
  return <div className="dashboard-page">{children}</div>;
}

export default Dashboard;
