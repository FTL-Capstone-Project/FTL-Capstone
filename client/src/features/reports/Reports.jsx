import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import ReportCard from "./ReportCard.jsx";
import { mockReports } from "./mockReports.js"; // TEMP (O1) — remove when the real API returns data

// The verdict filter options (O2). `value` is what we compare against each
// report's `kind`; `label` is what the user sees. Note: our verdict kind for
// "Suspicious" is stored as "review" (see config/constants.js VERDICT_STYLES).
const FILTERS = [
  { value: "all",       label: "All" },
  { value: "safe",      label: "Safe" },
  { value: "review",    label: "Suspicious" },
  { value: "dangerous", label: "Dangerous" },
];

// While Clerk isn't fully wired yet (Michael's slice), fall back to this role so
// we can build + see BOTH variants locally. Flip to "member" to preview the
// org-member view; set back to "individual" for the solo view. TODO(Ozias):
// remove the fallback once Clerk provides the real role.
const MOCK_ROLE = "member";

// My checks — adapts to the signed-in user's role (O2 + O3).
//  • individual: my checks + verdict filter, NO analyst/closure status.
//  • member:     same, PLUS the closure StatusChip on each card (story #7 payoff).
// One page, two variants (they differ only by that chip) — not two routes.
export default function Reports() {
  const { getToken } = useAuth();
  const { user } = useUser(); // Clerk's signed-in user (null until Clerk is wired)
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("all"); // which verdict is selected; "all" = show everything

  // Role decides whether closure status is shown. Read it from Clerk when
  // available, else use the mock. FRONTEND role = what to SHOW only; the real
  // security is the backend filtering data by the verified session (story #12).
  const role = user?.publicMetadata?.role ?? MOCK_ROLE;
  const isMember = role === "member";

  useEffect(() => {
    api.get("/api/history?mine=1", { getToken })
      // The API is still a stub that returns an empty list, so fall back to
      // mock data for now. Once the real endpoint returns reports, this
      // fallback simply stops being used. TODO(Ozias): drop mock in Phase 3.
      .then((data) => setReports(data.reports?.length ? data.reports : mockReports))
      .catch(() => setReports(mockReports));
  }, [getToken]);

  // Show all reports, or only those whose verdict matches the selected filter.
  const visibleReports =
    filter === "all" ? reports : reports.filter((r) => r.kind === filter);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ color: "var(--navy)", marginBottom: 16 }}>My checks</h1>

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

      {/* The list. Three states: no reports at all, none match the filter, or show them. */}
      {reports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No checks yet — paste a link on the Home page to get started.</p>
      ) : visibleReports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No {filter} reports.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visibleReports.map((r) => (
            <ReportCard key={r.indicator_id} report={r} showReviewStatus={isMember} />
          ))}
        </div>
      )}
    </div>
  );
}
