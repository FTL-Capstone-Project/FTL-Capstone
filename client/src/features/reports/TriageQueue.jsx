import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ListChecks } from "lucide-react";
import { api } from "../../lib/api.js";
import ReportCard from "./ReportCard.jsx";
import ReportDetailModal from "./ReportDetailModal.jsx";
import CampaignGroupRow from "./CampaignGroupRow.jsx";
import { sortByPriority, isPending, groupByCampaign, isForwardedEmail } from "./triagePriority.js";

// ── feature: reports · analyst triage queue · owner: Ozias ──
// The ANALYST variant of the Reports page (card G1·05): an org-wide triage queue.
// Reads GET /api/history?org=1&all=1 (analyst mode — returns the WHOLE org queue,
// including pending/investigating items the normal shared-only Team History hides).
// Rows are priority-sorted (open first, then most dangerous, then newest) and can be
// narrowed to just what's awaiting review. Reuses ReportCard + the detail modal (which
// carries the analyst verdict form from card G1·02). NO campaign grouping yet (G1·06).

const Filters = {
  ALL: "all",
  PENDING: "pending",
  EMAIL: "email", // forwarded emails only (report.source === "email")
};

const TriageQueue = () => {
  const { getToken } = useAuth();
  const [reports, setReports] = useState([]);
  const [campaigns, setCampaigns] = useState([]); // for grouping rows by campaign (G1·06)
  const [filter, setFilter] = useState(Filters.ALL); // "all" | "pending"
  const [selected, setSelected] = useState(null);     // open report (null = closed)

  // Load the full org queue for this analyst. all=1 asks the backend to skip the
  // shared-only privacy gate so pending/investigating items are included.
  useEffect(() => {
    api.get("/api/history?org=1&all=1", { getToken })
      .then((data) => setReports(data.reports ?? []))
      .catch(() => setReports([]));
  }, [getToken]);

  // Load this org's campaigns so related reports can cluster under a campaign header.
  // Graceful fallback: if the endpoint is unavailable, we just render rows ungrouped.
  useEffect(() => {
    api.get("/api/campaigns", { getToken })
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => setCampaigns([]));
  }, [getToken]);

  // Counts shown on the pills.
  const pendingCount = reports.filter(isPending).length;
  const emailCount = reports.filter(isForwardedEmail).length;

  // Apply the selected filter first, THEN priority-sort, THEN cluster by campaign.
  const filtered =
    filter === Filters.PENDING ? reports.filter(isPending)
      : filter === Filters.EMAIL ? reports.filter(isForwardedEmail)
      : reports;
  const visible = sortByPriority(filtered);
  const items = groupByCampaign(visible, campaigns); // report + campaign items, in priority order

  const PILLS = [
    { value: Filters.ALL, label: `All reports (${reports.length})` },
    { value: Filters.PENDING, label: `Pending review (${pendingCount})` },
    { value: Filters.EMAIL, label: `Forwarded (${emailCount})` },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <ListChecks size={22} color="var(--primary)" />
        <h1 style={{ color: "var(--navy)", margin: 0 }}>Triage queue</h1>
      </div>
      <p style={{ color: "var(--text-dim)", margin: "0 0 20px", fontSize: "0.9em" }}>
        Organization-wide view — highest priority first
      </p>

      {/* Filter pills: All vs. just what's awaiting a verdict. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {PILLS.map((p) => {
          const isActive = filter === p.value;
          return (
            <button
              key={p.value}
              onClick={() => setFilter(p.value)}
              style={{ cursor: "pointer", fontSize: "0.85em", fontWeight: 600, padding: "6px 16px",
                borderRadius: 999, border: "1px solid var(--border)",
                background: isActive ? "var(--primary)" : "var(--surface)",
                color: isActive ? "#fff" : "var(--text-dim)" }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* The queue. Empty states depend on which filter is active. */}
      {reports.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>
          No reports in your organization yet.
        </p>
      ) : visible.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>Nothing pending review — the queue is clear.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item) =>
            item.type === "campaign" ? (
              <CampaignGroupRow
                key={`campaign-${item.campaignId}`}
                name={item.name}
                reports={item.reports}
                onOpen={(r) => setSelected(r)}
              />
            ) : (
              <ReportCard
                key={item.report.indicator_id}
                report={item.report}
                showReviewStatus={true}
                onOpen={() => setSelected(item.report)}
              />
            )
          )}
        </div>
      )}

      {/* The analyst opens a report to author/update its verdict (form from G1·02). */}
      {selected && (
        <ReportDetailModal
          report={selected}
          isMember={true}
          isAnalyst={true}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default TriageQueue;
