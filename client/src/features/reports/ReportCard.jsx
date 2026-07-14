import StatusBadge from "../../components/StatusBadge.jsx";
import StatusChip from "./StatusChip.jsx";

// One report row in the "My checks" list — built to match the wireframe
// (client/src/assets/wireframes/Personal/Orbis Reports_Page (Personal).png).
//
// `report` fields (see mockReports.js for the full shape + notes):
//   title, description, tags[], reported_by, created_at, kind, ai_score,
//   screenshot_url, review (org members only).
//
// The score-direction and title/tags fields depend on David's data (flagged
// in mockReports.js). If David hasn't added a field yet, we fall back so the
// card still renders instead of breaking.
//
// `showReviewStatus` — off by default = the INDIVIDUAL view (no analyst/closure
// chip, because a solo user has no security team). The org-member variant (O3)
// passes showReviewStatus={true} to reveal the closure chip.
export default function ReportCard({ report, showReviewStatus = false }) {
  return (
    <div className="report-card" style={{ display: "flex", gap: 14, background: "var(--surface)",
      border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>

      {/* Thumbnail of the detonated page. Grey placeholder until urlscan gives us one. */}
      <div style={{ width: 96, height: 72, flexShrink: 0, borderRadius: 8,
        background: report.screenshot_url ? `center/cover url(${report.screenshot_url})` : "var(--border)" }} />

      {/* Middle: title, who/when, description, tags */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "1em", color: "var(--navy)", minWidth: 0,
            // A long URL title (no spaces) would otherwise push the card off-screen;
            // truncate it to one line with an ellipsis.
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {report.title ?? report.url}
          </h3>
          <div style={{ flexShrink: 0 }}><StatusBadge kind={report.kind} /></div>
        </div>

        <p style={{ margin: "0 0 6px", fontSize: "0.8em", color: "var(--text-dim)" }}>
          Reported by {report.reported_by ?? "you"} · {report.created_at}
        </p>

        {report.description && (
          <p style={{ margin: "0 0 8px", fontSize: "0.88em", color: "var(--text)",
            // Clamp to 2 lines instead of one no-wrap line: a long description now
            // wraps and truncates with an ellipsis instead of forcing the card wider
            // than the screen (the old `nowrap` broke the flex layout).
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden", overflowWrap: "anywhere" }}>
            {report.description}
          </p>
        )}

        {report.tags?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {report.tags.map((tag) => (
              <span key={tag} style={{ fontSize: "0.72em", color: "var(--text-dim)",
                background: "var(--canvas)", border: "1px solid var(--border)",
                borderRadius: 999, padding: "2px 10px" }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right: the Orbo score, and (org members) the analyst closure status */}
      <div className="report-card__score" style={{ flexShrink: 0, textAlign: "right", minWidth: 84 }}>
        <div style={{ fontSize: "0.68em", fontWeight: 700, color: "var(--text-dim)",
          letterSpacing: "0.04em" }}>SAFETY SCORE</div>
        <div style={{ fontSize: "1.5em", fontWeight: 800, color: `var(--${scoreColor(report.kind)})` }}>
          {report.ai_score ?? "—"}<span style={{ fontSize: "0.5em", color: "var(--text-dim)" }}>/100</span>
        </div>
        {showReviewStatus && report.review?.review_status && (
          <div style={{ marginTop: 6 }}>
            <StatusChip status={report.review.review_status} />
          </div>
        )}
      </div>
    </div>
  );
}

// Map the verdict "kind" to a theme color token for the score number.
function scoreColor(kind) {
  if (kind === "safe") return "safe";
  if (kind === "dangerous") return "danger";
  return "review";
}
