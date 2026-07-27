import { useState } from "react";
import { Link } from "react-router-dom";
import { Layers, ChevronDown, ChevronRight } from "lucide-react";
import ReportCard from "./ReportCard.jsx";

// ── feature: reports · campaign group · owner: Ozias ── (card G1·06)
// A cluster of related/duplicate reports in the analyst triage queue, collapsed under
// one campaign header (name + how many links / reports). Reuses ReportCard for each row inside.
//
// TWO affordances, deliberately split: the CHEVRON expands the group in place (a quick peek
// without leaving the queue), while the campaign NAME is a link to the full campaign page.
// They're siblings, not nested — a <Link> inside a <button> is invalid HTML, and it would also
// fold the link's text into the button's accessible name.
//
// Props:
//   name       — campaign name (e.g. "Bank impersonation")
//   campaignId — which campaign, for the /reports/campaigns/:campaignId link
//   reports    — the report rows in this campaign (already priority-sorted by the parent)
//   onOpen     — open a report's detail modal (passed through to each ReportCard)
const CampaignGroupRow = ({ name, campaignId, reports, onOpen }) => {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--canvas)", overflow: "hidden" }}>
      {/* Campaign header — the collapsed "20 reports → one row" summary. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: 0,
            background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <Chevron size={18} color="var(--text-dim)" />
          <Layers size={18} color="var(--primary)" />
        </button>
        <Link
          to={`/reports/campaigns/${campaignId}`}
          style={{ fontWeight: 700, color: "var(--navy)", textDecoration: "none" }}
        >
          {name}
        </Link>
        <span style={{ marginLeft: "auto", fontSize: "0.8em", color: "var(--text-dim)" }}>
          {reports.length} {reports.length === 1 ? "report" : "reports"}
        </span>
      </div>

      {/* Expanded: the individual reports in this campaign. */}
      {open && (
        <div style={{ display: "grid", gap: 8, padding: "0 12px 12px" }}>
          {reports.map((r) => (
            <ReportCard
              key={r.indicator_id}
              report={r}
              showReviewStatus={true}
              onOpen={() => onOpen?.(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CampaignGroupRow;
