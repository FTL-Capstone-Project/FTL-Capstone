// ── feature: dashboard · MemberDashboard · owner: Michael ──
// The dashboard variant for a MEMBER (in an org, not an admin/analyst). A member cares
// about two things: their own protection AND what's hitting the wider team. So this
// blends personal stats with an org-wide "team awareness" block.
//
// It fetches the SAME GET /api/dashboard as the personal dashboard — the server now
// attaches a `team` block whenever the caller is in an org (dashboard.routes.js). Every
// team LIST here (Confirmed by Your Analysts) is already gated server-side to reviews an
// analyst explicitly shared; team COUNTS are aggregates that reveal no individual item.
import { useEffect, useState } from "react";
import { useApi } from "../../lib/useApi.js";
import { useOrbisRole } from "../../lib/useOrbisRole.js";
import StatTile from "./StatTile.jsx";
import SubmissionHistoryChart from "./SubmissionHistoryChart.jsx";
import ResultsDonut from "./ResultsDonut.jsx";
import ThreatTypesChart from "./ThreatTypesChart.jsx";
import TeamConfirmed from "./TeamConfirmed.jsx";
import RecentSubmissions from "./RecentSubmissions.jsx";
import ActivityRail from "./ActivityRail.jsx";
import DashboardEmpty from "./DashboardEmpty.jsx";
import RetryButton from "../../components/RetryButton.jsx";

const MemberDashboard = () => {
  const { orgName } = useOrbisRole();
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const [nonce, setNonce] = useState(0); // bump to re-run the loader (backs the "Try again" button)
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
        <p style={{ color: "var(--text-dim)" }}>Loading your team dashboard…</p>
      </Page>
    );
  }

  // team should always be present for a member, but default it so a race (role says
  // member before orgId lands) can't crash the render.
  const { stats, team = { stats: {}, threatTypes: [], recentlyConfirmed: [] } } = data;
  const teamStats = team.stats ?? {};

  // Truly empty = the member has run no checks AND the team has none either → friendly
  // empty state instead of a wall of zeros.
  if (data.results.total === 0 && (teamStats.teamTotalChecks ?? 0) === 0) {
    return (
      <Page>
        <Header orgName={orgName} />
        <DashboardEmpty />
      </Page>
    );
  }

  return (
    <Page>
      <Header orgName={orgName} />

      <div className="dashboard-shell">
        <div style={{ display: "grid", gap: 20 }}>
          {/* Top row: my engagement + team threat picture. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
            <StatTile
              label="My Checks This Week"
              value={stats.checksThisWeek.value}
              trend={stats.checksThisWeek.trend}
            />
            <StatTile
              label="Team Threats This Week"
              value={teamStats.teamThreatsThisWeek ?? 0}
              sub="Dangerous links across your team"
            />
            <StatTile
              label="Team Reports This Week"
              value={teamStats.teamReportsThisWeek ?? 0}
              sub="Checks your team ran"
            />
            <StatTile
              label="Active Campaigns"
              value={teamStats.activeCampaigns ?? 0}
              sub="Coordinated attacks flagged"
            />
          </div>

          {/* Team threat mix + my personal results side by side.
              minmax(0, 1fr) NOT "1fr 1fr": a bare 1fr is minmax(auto, 1fr), whose `auto` floor is
              the child's min-content width. The Recharts ThreatTypesChart reports a min width, so
              a 1fr track can't shrink and the whole page scrolls sideways. minmax(0, …) lets it
              shrink (matches the outer .dashboard-shell grid). */}
          <div className="dash-two-col">
            {team.threatTypes?.length > 0 ? (
              <ThreatTypesChart
                types={team.threatTypes}
                title="What's Targeting Us"
                sub="Threat categories hitting your team"
              />
            ) : (
              <SubmissionHistoryChart history={data.submissionHistory} />
            )}
            <ResultsDonut results={data.results} />
          </div>

          {/* Confirmed by analysts (shared-only) + my recent checks. */}
          <TeamConfirmed items={team.recentlyConfirmed ?? []} />
          <RecentSubmissions items={data.recentSubmissions} />
        </div>

        {/* Right rail: personal activity + Ask Orbo data-query chat. */}
        <ActivityRail activity={data.activity} role="member" />
      </div>
    </Page>
  );
};

const Header = ({ orgName }) => (
  <h1 style={{ color: "var(--navy)", margin: "0 0 20px" }}>
    {orgName ? `${orgName} Dashboard` : "Team Dashboard"}
  </h1>
);

const Page = ({ children }) => (
  <div className="dashboard-page">{children}</div>
);

export default MemberDashboard;
