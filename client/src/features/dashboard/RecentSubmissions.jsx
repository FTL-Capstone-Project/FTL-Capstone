// ── feature: dashboard · RecentSubmissions · owner: Michael ──
// "My Recent Submissions" — the latest few checks as compact rows (thumbnail,
// title, date, Orbo score, verdict pill). "View All History" → the Reports page.
// Reuses StatusBadge so the verdict pill looks identical to the Reports cards.
import { Link } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge.jsx";

// score → the same color the verdict uses (green/amber/red), for the "NN/100" text.
const KIND_COLOR = { safe: "var(--safe)", review: "var(--review)", dangerous: "var(--danger)" };

export default function RecentSubmissions({ items }) {
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
        <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: 0 }}>My Recent Submissions</h2>
        <Link
          to="/reports"
          style={{
            fontSize: "0.82em",
            fontWeight: 600,
            color: "var(--primary)",
            textDecoration: "none",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "6px 14px",
          }}
        >
          View All History
        </Link>
      </div>

      <div style={{ display: "grid" }}>
        {items.map((s, i) => (
          <div
            key={s.indicatorId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 0",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            {/* thumbnail placeholder (grey until urlscan gives a screenshot) */}
            <div style={{ width: 56, height: 42, flexShrink: 0, borderRadius: 6, background: "var(--border)" }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--navy)", fontWeight: 600, fontSize: "0.92em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.title}
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: "0.78em" }}>{formatDate(s.createdAt)}</div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "0.68em", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-dim)", textTransform: "uppercase" }}>
                Orbo Score
              </div>
              <div style={{ fontWeight: 800, color: s.score == null ? "var(--text-dim)" : KIND_COLOR[s.kind] }}>
                {s.score == null ? "—" : `${s.score}/100`}
              </div>
            </div>

            <div style={{ flexShrink: 0, width: 110, display: "flex", justifyContent: "flex-end" }}>
              <StatusBadge kind={s.kind} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso) {
  const d = new Date(iso);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
