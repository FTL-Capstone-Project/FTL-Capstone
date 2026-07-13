import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
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

// My checks — Individual variant (O2). Fetches my reports, lets me filter by verdict.
// Individuals see NO analyst/closure status (that's the org-member variant, O3).
export default function Reports() {
  const { getToken } = useAuth();
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("all"); // which verdict is selected; "all" = show everything

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
          {visibleReports.map((r) => <ReportCard key={r.indicator_id} report={r} />)}
        </div>
      )}
    </div>
  );
}
