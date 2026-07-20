import StatusBadge from "../../components/StatusBadge.jsx";

// Safely embed a URL inside a CSS url(). The screenshot URL is our own (from urlscan), but a
// stray ")" / quote / newline in a URL could break out of the url() and inject CSS — so we
// only allow http(s), then encode any CSS-significant chars and wrap in quotes. Returns a full
// `url("...")` string, or null if the URL isn't a safe http(s) URL.
const cssUrl = (raw) => {
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw)) return null;
  const safe = raw.replace(/["'()\\\s]/g, encodeURIComponent);
  return `url("${safe}")`;
};

// One report row in the "My checks" list — built to match the wireframe
// (client/src/assets/wireframes/Personal/Orbis Reports_Page (Personal).png).
//
// `report` comes from GET /api/history and has these fields:
//   title, description, tags[], reported_by, created_at, kind, ai_score,
//   screenshot_url, review (org members only).
//
// ai_score is a 0-100 SAFETY score (higher = safer). Any field may be missing
// for older rows, so we fall back below so the card still renders.
//
// `showReviewStatus` — off by default = the INDIVIDUAL view (single "SAFETY SCORE",
// because a solo user has no security team). The org-member variant passes
// showReviewStatus={true} to reveal the second "ANALYST SCORE" (the analyst's
// human score, or "Pending"), matching the Organizational Reports wireframe.
//
// `onOpen` — click/Enter/Space opens the detail modal. The card acts as a button
// (role + tabIndex + key handler) so it's reachable by keyboard, not just mouse.
const ReportCard = ({ report, showReviewStatus = false, onOpen }) => {
  // Format the DB timestamp ("2026-07-14T23:03:28.535Z") into a readable date
  // like "Jul 14, 2026". Guarded so a null/invalid value shows nothing (not 1970).
  const when = report.created_at
    ? new Date(report.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    // The card is a plain container that keeps a real <h3> heading (so screen-reader
    // users can navigate report titles by heading). Only the TITLE is the actual
    // button; a stretched invisible overlay keeps the whole card clickable.
    <article
      className="report-card"
      style={{ position: "relative", display: "flex", gap: 14, background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>

      {/* Thumbnail of the detonated page. Grey placeholder until urlscan gives us one. */}
      <div style={{ width: 96, height: 72, flexShrink: 0, borderRadius: 8,
        background: cssUrl(report.screenshot_url) ? `center/cover ${cssUrl(report.screenshot_url)}` : "var(--border)" }} />

      {/* Middle: title, who/when, description, tags */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "1em", minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {/* The button is the ONLY interactive element; its ::after (below) stretches
                over the whole card so a click anywhere opens the modal. */}
            <button
              onClick={() => onOpen?.()}
              className="report-card__open"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                font: "inherit", color: "var(--navy)", textAlign: "left" }}
            >
              {report.title ?? report.url}
            </button>
          </h3>
          <div style={{ flexShrink: 0 }}><StatusBadge kind={report.kind} /></div>
        </div>

        <p style={{ margin: "0 0 6px", fontSize: "0.8em", color: "var(--text-dim)" }}>
          Reported by {report.reported_by ?? "you"}{when ? ` · ${when}` : ""}
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

      {/* Right: the Orbo (AI) score. Org members ALSO see the analyst's score
          (matches the Organizational wireframe's stacked "Orbo + Analyst" column). */}
      <div className="report-card__score" style={{ flexShrink: 0, textAlign: "right", minWidth: 96 }}>
        {/* Orbo (AI) score — shown to everyone. Individuals see it as "SAFETY SCORE";
            org members see the dual layout, so it's labeled "ORBO SCORE". */}
        <div style={scoreLabelStyle}>{showReviewStatus ? "ORBO SCORE" : "SAFETY SCORE"}</div>
        <div style={{ fontSize: "1.5em", fontWeight: 800, color: `var(--${scoreColor(report.kind)})` }}>
          {report.ai_score ?? "—"}<span style={{ fontSize: "0.5em", color: "var(--text-dim)" }}>/100</span>
        </div>

        {/* Analyst score — ORG MEMBERS ONLY, when this item has a review.
            Scored → the human number + "Scored by <analyst>"; not yet → "Pending". */}
        {showReviewStatus && report.review && (
          <div style={{ marginTop: 10 }}>
            <div style={scoreLabelStyle}>ANALYST SCORE</div>
            {report.review.human_score != null ? (
              <>
                <div style={{ fontSize: "1.5em", fontWeight: 800,
                  color: `var(--${scoreColor(scoreToKind(report.review.human_score))})` }}>
                  {report.review.human_score}<span style={{ fontSize: "0.5em", color: "var(--text-dim)" }}>/100</span>
                </div>
                <div style={scoredByStyle}>Scored by {report.review.reviewed_by ?? "an analyst"}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "1.15em", fontWeight: 800, color: "var(--text-dim)" }}>Pending</div>
                <div style={scoredByStyle}>Scored by Orbo (AI)</div>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// Map the verdict "kind" to a theme color token for the score number.
const scoreColor = (kind) => {
  if (kind === "safe") return "safe";
  if (kind === "dangerous") return "danger";
  return "review";
}

// Turn a 0-100 SAFETY score into a verdict "kind" so the analyst number is colored
// the same way as the Orbo number. Mirrors scoreToKind in history.service.js.
const scoreToKind = (score) => {
  if (score == null) return "review";
  if (score >= 70) return "safe";
  if (score >= 35) return "review";
  return "dangerous";
}

// Shared small styles for the score column (keeps the JSX readable).
const scoreLabelStyle = { fontSize: "0.68em", fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.04em" };
const scoredByStyle = { fontSize: "0.66em", fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 };

export default ReportCard;
