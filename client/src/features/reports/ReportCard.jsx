import StatusBadge from "../../components/StatusBadge.jsx";
import StatusChip from "./StatusChip.jsx";

// One report row. `report` = { indicatorId, url, kind, score, createdAt, reviewStatus? }.
export default function ReportCard({ report }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)",
      border: "1px solid var(--border)", borderRadius: 10, padding: "11px 14px" }}>
      <StatusBadge kind={report.kind} />
      <span style={{ flex: 1, fontSize: "0.9em" }}>{report.url}</span>
      {report.reviewStatus && <StatusChip status={report.reviewStatus} />}
      <span style={{ fontSize: "0.8em", color: "var(--text-dim)" }}>{report.createdAt}</span>
    </div>
  );
}
