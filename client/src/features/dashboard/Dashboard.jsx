// ── feature: dashboard · owner: Michael ──
// Role-router: analysts get the org-wide AnalystDashboard; everyone else gets the
// personal "My Dashboard". The two variants are separate components so they can
// fetch from different endpoints and render different chart sets independently.
import { useEffect, useState } from "react";
import { useApi } from "../../lib/useApi.js";
import { useOrbisRole } from "../../lib/useOrbisRole.js";
import AnalystDashboard from "./AnalystDashboard.jsx";
import StatTile from "./StatTile.jsx";
import SubmissionHistoryChart from "./SubmissionHistoryChart.jsx";
import ResultsDonut from "./ResultsDonut.jsx";
import RecentSubmissions from "./RecentSubmissions.jsx";
import ActivityRail from "./ActivityRail.jsx";
import DashboardEmpty from "./DashboardEmpty.jsx";

const Dashboard = () => {
  const { role } = useOrbisRole();

  // Analysts see the org-wide triage dashboard; all other roles see their personal one.
  if (role === "analyst") return <AnalystDashboard />;

  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/dashboard")
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [api]);

  if (error) {
    return (
      <Page>
        <p style={{ color: "var(--text-dim)" }}>Couldn't load your dashboard. Please try again.</p>
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

      {/* Two columns: main content + right activity rail (rail drops below on narrow screens). */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 24, alignItems: "start" }}>
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
            />
            <StatTile
              label="My Safety Score"
              value={stats.safetyScore == null ? "—" : `${stats.safetyScore}/100`}
              sub={stats.safetyScore == null ? "Run a check to see this" : "Avg safety of links you checked"}
            />
            <StatTile
              label="Checks Remaining"
              value={`${Math.max(0, stats.checksRemaining.limit - stats.checksRemaining.used)}/${stats.checksRemaining.limit}`}
              progress={(1 - stats.checksRemaining.used / stats.checksRemaining.limit) * 100}
            />
          </div>

          {/* Middle: submission-history bars + results donut */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <SubmissionHistoryChart history={data.submissionHistory} />
            <ResultsDonut results={data.results} />
          </div>

          {/* Bottom: recent submissions */}
          <RecentSubmissions items={data.recentSubmissions} />
        </div>

        {/* Right rail: activity feed + Ask Orbo mini-box */}
        <ActivityRail activity={data.activity} />
      </div>
    </Page>
  );
}

// Shared page frame (centers content, matches Reports' spacing).
const Page = ({ children }) => {
  return <div style={{ maxWidth: 1080, margin: "40px auto", padding: "0 24px" }}>{children}</div>;
}

export default Dashboard;
