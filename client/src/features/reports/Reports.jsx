import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { useOrbisRole } from "../../lib/useOrbisRole.js";
import ReportCard from "./ReportCard.jsx";
import ReportDetailModal from "./ReportDetailModal.jsx";
import HistoryScopeToggle from "./HistoryScopeToggle.jsx";
import TriageQueue from "./TriageQueue.jsx";
import { isForwardedEmail } from "./triagePriority.js";

// The filter options (O2). Most compare against each report's verdict `kind`; "Forwarded" is a
// different dimension (report `source`), handled specially below. Note: our verdict kind for
// "Suspicious" is stored as "review" (see config/constants.js VERDICT_STYLES).
const FILTERS = [
  { value: "all",       label: "All" },
  { value: "safe",      label: "Safe" },
  { value: "review",    label: "Suspicious" },
  { value: "dangerous", label: "Dangerous" },
  { value: "email",     label: "Forwarded" }, // source === "email" (grouped forwarded emails)
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
  const [reports, setReports] = useState([]);       // my ACTIVE reports (?mine=1)
  const [archivedReports, setArchivedReports] = useState([]); // my archived reports (?mine=1&archived=1)
  const [teamReports, setTeamReports] = useState([]); // my whole org's reports (?org=1)
  const [scope, setScope] = useState("mine");       // which list is showing: "mine" | "team"
  const [filter, setFilter] = useState("all"); // which verdict is selected; "all" = show everything
  const [showArchived, setShowArchived] = useState(false); // My History sub-view: active vs archived
  const [selected, setSelected] = useState(null); // the report whose detail modal is open (null = closed)

  // Members see the closure chip + Team History toggle; solo individuals don't.
  // (Analysts never reach here — they get TriageQueue above.) FRONTEND role = what
  // to SHOW only; real security is the backend filtering by the verified session.
  const isMember = role === "member";

  // Always load my own ACTIVE reports (the default "My History" view).
  useEffect(() => {
    api.get("/api/history?mine=1", { getToken })
      .then((data) => setReports(data.reports ?? []))
      .catch(() => setReports([]));
  }, [getToken]);

  // Load my ARCHIVED reports only when I actually open the archived sub-view (lazy, like Team History).
  useEffect(() => {
    if (scope !== "mine" || !showArchived) return;
    api.get("/api/history?mine=1&archived=1", { getToken })
      .then((data) => setArchivedReports(data.reports ?? []))
      .catch(() => setArchivedReports([]));
  }, [scope, showArchived, getToken]);

  // Load the org-wide reports only for org members, and only when they actually
  // open the Team History tab (don't fetch data the user may never look at).
  useEffect(() => {
    if (!isMember || scope !== "team") return;
    api.get("/api/history?org=1", { getToken })
      .then((data) => setTeamReports(data.reports ?? []))
      .catch(() => setTeamReports([]));
  }, [isMember, scope, getToken]);

  // Archive one of MY reports: hide it locally right away (optimistic), then persist. On failure,
  // reload from the server so the UI can't drift from the DB. Only ever hits my own rows (backend guard).
  const handleArchive = async (report) => {
    const id = report.indicator_id;
    setReports((rows) => rows.filter((r) => r.indicator_id !== id));
    setArchivedReports((rows) => (rows.some((r) => r.indicator_id === id) ? rows : [report, ...rows]));
    try {
      await api.patch(`/api/history/${id}/archive`, { archived: true }, { getToken });
    } catch {
      reloadMine();
      reloadArchived();
    }
  }

  // Restore an archived report back to the active list (reverse of archive).
  const handleRestore = async (report) => {
    const id = report.indicator_id;
    setArchivedReports((rows) => rows.filter((r) => r.indicator_id !== id));
    setReports((rows) => (rows.some((r) => r.indicator_id === id) ? rows : [report, ...rows]));
    try {
      await api.patch(`/api/history/${id}/archive`, { archived: false }, { getToken });
    } catch {
      reloadMine();
      reloadArchived();
    }
  }

  // Permanently delete one of MY reports (confirm first — it's irreversible). Removes it from
  // whichever list it's in. Backend only touches my Submission rows, never the shared indicator.
  const handleDelete = async (report) => {
    const id = report.indicator_id;
    if (!window.confirm("Delete this report permanently? This can't be undone.")) return;
    setReports((rows) => rows.filter((r) => r.indicator_id !== id));
    setArchivedReports((rows) => rows.filter((r) => r.indicator_id !== id));
    if (selected?.indicator_id === id) setSelected(null); // close the modal if it was showing this one
    try {
      await api.delete(`/api/history/${id}`, { getToken });
    } catch {
      reloadMine();
      reloadArchived();
    }
  }

  // Small reload helpers used to recover from a failed optimistic update.
  const reloadMine = () =>
    api.get("/api/history?mine=1", { getToken }).then((d) => setReports(d.reports ?? [])).catch(() => {});
  const reloadArchived = () =>
    api.get("/api/history?mine=1&archived=1", { getToken }).then((d) => setArchivedReports(d.reports ?? [])).catch(() => {});

  // Which dataset is active: Team History, my archived list, or my active list. Then apply the
  // selected filter on top of whichever is showing. "Forwarded" filters by report SOURCE (how it
  // arrived); the rest filter by verdict KIND.
  const activeReports = scope === "team" ? teamReports : showArchived ? archivedReports : reports;
  const visibleReports =
    filter === "all" ? activeReports
      : filter === "email" ? activeReports.filter(isForwardedEmail)
      : activeReports.filter((r) => r.kind === filter);
  // Row actions only make sense on MY History (not Team History, which is other people's reports).
  const canManage = scope === "mine";
  // Only solo individuals may permanently delete: a member's report feeds the analyst queue, so the
  // backend forbids member deletes (they archive instead). Mirror that here so we don't offer a
  // Delete that would just 403. Archive/restore stay available to everyone on My History.
  const canDelete = canManage && !isMember;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      {/* Title row. Org members also get the My/Team History toggle on the right. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>
          {scope === "team" ? "Team History" : showArchived ? "Archived" : "My checks"}
        </h1>
        {isMember && <HistoryScopeToggle scope={scope} onChange={setScope} />}
      </div>

      {/* Active | Archived sub-toggle — My History only (Team History has no archived view). */}
      {canManage && (
        <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
          {[
            { value: false, label: "Active" },
            { value: true,  label: "Archived" },
          ].map(({ value, label }) => {
            const isActive = showArchived === value;
            return (
              <button
                key={label}
                onClick={() => setShowArchived(value)}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                  background: "none", border: "none", padding: "4px 2px", fontSize: "0.9em",
                  fontWeight: 600, color: isActive ? "var(--navy)" : "var(--text-dim)",
                  borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent" }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

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
            : showArchived
              ? "No archived reports — archive a check from its ⋯ menu to tuck it away here."
              : "No checks yet — paste a link on the Home page to get started."}
        </p>
      ) : visibleReports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>
          {/* Forwarded emails get their own wording; every other filter uses the pill's
              user-facing label ("Suspicious"), not the raw kind ("review"). */}
          {filter === "email"
            ? "No forwarded emails yet."
            : `No ${(FILTERS.find((f) => f.value === filter)?.label ?? filter).toLowerCase()} reports.`}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visibleReports.map((r) => (
            <ReportCard
              key={r.indicator_id}
              report={r}
              showReviewStatus={isMember}
              onOpen={() => setSelected(r)}
              // Row actions on My History only. Archived rows offer Restore; active rows offer
              // Archive. Delete is individual-only (members archive instead — see canDelete).
              isArchived={showArchived}
              onArchive={canManage && !showArchived ? () => handleArchive(r) : undefined}
              onRestore={canManage && showArchived ? () => handleRestore(r) : undefined}
              onDelete={canDelete ? () => handleDelete(r) : undefined}
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
