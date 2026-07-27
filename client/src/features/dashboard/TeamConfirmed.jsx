// ── feature: dashboard · TeamConfirmed · owner: Michael ──
// "Confirmed by Your Analysts" — the most recent verdicts an analyst SHARED with the
// org (server already filters to sharedWithOrg = true, the privacy gate). Gives a
// member a short, trustworthy list of what's been officially confirmed so they stay
// alert to the scams actually hitting their team. Reuses StatusBadge for the verdict pill.
import { Link } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge.jsx";

const KIND_COLOR = { safe: "var(--safe)", review: "var(--review)", dangerous: "var(--danger)" };

const TeamConfirmed = ({ items }) => {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 2px" }}>Confirmed by Your Analysts</h2>
          <p style={{ color: "var(--text-dim)", fontSize: "0.78em", margin: 0 }}>Verdicts your team shared</p>
        </div>
        <Link
          to="/reports"
          style={{
            fontSize: "0.82em", fontWeight: 600, color: "var(--primary)", textDecoration: "none",
            border: "1px solid var(--border)", borderRadius: 999, padding: "6px 14px",
          }}
        >
          Team History
        </Link>
      </div>

      {items.length === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "8px 0" }}>
          Nothing confirmed yet. When an analyst shares a verdict, it shows up here.
        </p>
      ) : (
        <div style={{ display: "grid" }}>
          {items.map((r, i) => (
            <div
              key={r.indicatorId}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--navy)", fontWeight: 600, fontSize: "0.92em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: "0.78em" }}>
                  {r.reviewedBy ? `Reviewed by ${r.reviewedBy}` : r.domain}
                </div>
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "0.68em", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-dim)", textTransform: "uppercase" }}>
                  Score
                </div>
                <div style={{ fontWeight: 800, color: r.score == null ? "var(--text-dim)" : KIND_COLOR[r.kind] }}>
                  {r.score == null ? "—" : `${r.score}/100`}
                </div>
              </div>

              <div style={{ flexShrink: 0, width: 110, display: "flex", justifyContent: "flex-end" }}>
                <StatusBadge kind={r.kind} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamConfirmed;
