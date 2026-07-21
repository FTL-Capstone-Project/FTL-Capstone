import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { useOrbisRole } from "../../lib/useOrbisRole.js";
import ReportCard from "./ReportCard.jsx";
import ReportDetailModal from "./ReportDetailModal.jsx";
import HistoryScopeToggle from "./HistoryScopeToggle.jsx";
import TriageQueue from "./TriageQueue.jsx";

// The verdict filter options (O2). `value` is what we compare against each
// report's `kind`; `label` is what the user sees. Note: our verdict kind for
// "Suspicious" is stored as "review" (see config/constants.js VERDICT_STYLES).
const FILTERS = [
  { value: "all",       label: "All" },
  { value: "safe",      label: "Safe" },
  { value: "review",    label: "Suspicious" },
  { value: "dangerous", label: "Dangerous" },
];

// My checks — adapts to the signed-in user's role (O2 + O3).
//  • individual: my checks + verdict filter, NO analyst/closure status.
//  • member:     same, PLUS the closure StatusChip on each card (story #7 payoff),
//                PLUS a "My History | Team History" toggle to see the whole org's
//                reports (what scams the organization has been running into).
// One page, role-driven variants — not separate routes. This top-level component is
// just a ROUTER by role: analysts get the org-wide triage queue (card G1·05); everyone
// else gets the personal "My checks" list below. Splitting the analyst path into its own
// component (instead of one shared isMember branch) keeps each variant's hooks self-
// contained — hooks must run unconditionally, so we pick the component, not skip hooks.
const Reports = () => {
  const { role } = useOrbisRole(); // authoritative role from Clerk org membership (Michael's hook)
  if (role === "analyst") return <TriageQueue />;
  return <MyChecks role={role} />;
}

// The individual / org-member Reports view: "My checks" + optional Team History toggle.
const MyChecks = ({ role }) => {
  const { getToken } = useAuth();
  const [reports, setReports] = useState([]);       // my own reports (?mine=1)
  const [teamReports, setTeamReports] = useState([]); // my whole org's reports (?org=1)
  const [scope, setScope] = useState("mine");       // which list is showing: "mine" | "team"
  const [filter, setFilter] = useState("all"); // which verdict is selected; "all" = show everything
  const [selected, setSelected] = useState(null); // the report whose detail modal is open (null = closed)

  // Members see the closure chip + Team History toggle; solo individuals don't.
  // (Analysts never reach here — they get TriageQueue above.) FRONTEND role = what
  // to SHOW only; real security is the backend filtering by the verified session.
  const isMember = role === "member";

  // Always load my own reports (the default "My History" view).
  useEffect(() => {
    api.get("/api/history?mine=1", { getToken })
      .then((data) => setReports(data.reports ?? []))
      .catch(() => setReports([]));
  }, [getToken]);

  // Load the org-wide reports only for org members, and only when they actually
  // open the Team History tab (don't fetch data the user may never look at).
  useEffect(() => {
    if (!isMember || scope !== "team") return;
    api.get("/api/history?org=1", { getToken })
      .then((data) => setTeamReports(data.reports ?? []))
      .catch(() => setTeamReports([]));
  }, [isMember, scope, getToken]);

  // Which dataset is active, then apply the verdict filter on top of it.
  const activeReports = scope === "team" ? teamReports : reports;
  const visibleReports =
    filter === "all" ? activeReports : activeReports.filter((r) => r.kind === filter);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      {/* Title row. Org members also get the My/Team History toggle on the right. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>
          {scope === "team" ? "Team History" : "My checks"}
        </h1>
        {isMember && <HistoryScopeToggle scope={scope} onChange={setScope} />}
      </div>

      {/* Verdict filter pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {FILTERS.map((f) => {
          const isActive = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                cursor: "pointer",
                fontSize: "0.85em",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                // The active pill is filled with the brand color; the rest are plain.
                background: isActive ? "var(--primary)" : "var(--surface)",
                color: isActive ? "#fff" : "var(--text-dim)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* The list. Three states: no reports at all, none match the filter, or show them.
          The "empty" message depends on which tab you're viewing. */}
      {activeReports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>
          {scope === "team"
            ? "No team checks yet — your organization's reports will show up here."
            : "No checks yet — paste a link on the Home page to get started."}
        </p>
      ) : visibleReports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No {filter} reports.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visibleReports.map((r) => (
            <ReportCard
              key={r.indicator_id}
              report={r}
              showReviewStatus={isMember}
              onOpen={() => setSelected(r)}
            />
          ))}
        </div>
      )}

      {/* Detail modal — opens when a card is clicked. Persona variant driven by isMember.
          No analyst form here: analysts get the triage queue's modal, not this one. */}
      {selected && (
        <ReportDetailModal
          report={selected}
          isMember={isMember}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default Reports;
