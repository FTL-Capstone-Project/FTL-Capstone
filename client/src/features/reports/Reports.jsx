import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import ReportCard from "./ReportCard.jsx";
import { mockReports } from "./mockReports.js"; // TEMP (O1) — remove when the real API returns data

// My checks. TODO(Ozias): verdict filter + org-member vs individual variant.
export default function Reports() {
  const { getToken } = useAuth();
  const [reports, setReports] = useState([]);

  useEffect(() => {
    api.get("/api/history?mine=1", { getToken })
      // The API is still a stub that returns an empty list, so fall back to
      // mock data for now. Once the real endpoint returns reports, this
      // fallback simply stops being used. TODO(Ozias): drop mock in Phase 3.
      .then((data) => setReports(data.reports?.length ? data.reports : mockReports))
      .catch(() => setReports(mockReports));
  }, [getToken]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ color: "var(--navy)", marginBottom: 16 }}>My checks</h1>
      {reports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No checks yet — paste a link on the Home page to get started.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {reports.map((r) => <ReportCard key={r.indicator_id} report={r} />)}
        </div>
      )}
    </div>
  );
}
