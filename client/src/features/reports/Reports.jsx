import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import ReportCard from "./ReportCard.jsx";

// My checks. TODO(Ozias): verdict filter + org-member vs individual variant.
export default function Reports() {
  const { getToken } = useAuth();
  const [reports, setReports] = useState([]);

  useEffect(() => {
    api.get("/api/history?mine=1", { getToken })
      .then((data) => setReports(data.reports ?? []))
      .catch(() => setReports([]));
  }, [getToken]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ color: "var(--navy)", marginBottom: 16 }}>My checks</h1>
      {reports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No checks yet — paste a link on the Home page to get started.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {reports.map((r) => <ReportCard key={r.indicatorId} report={r} />)}
        </div>
      )}
    </div>
  );
}
