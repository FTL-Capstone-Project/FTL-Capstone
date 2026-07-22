import { useState, useEffect, useRef } from "react";
import { Mail, MoreHorizontal, Archive, ArchiveRestore, Trash2 } from "lucide-react";
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
//
// ROW ACTIONS (My History only): pass any of `onArchive` / `onRestore` / `onDelete` to reveal
// the "⋯" menu (top-right). They're opt-in — the analyst TriageQueue renders ReportCard WITHOUT
// them, so it never shows the menu. `isArchived` picks Archive vs. Restore wording.
const ReportCard = ({ report, showReviewStatus = false, onOpen,
  onArchive, onRestore, onDelete, isArchived = false }) => {
  // Show the menu button only if the parent gave us at least one action to run.
  const hasActions = Boolean(onArchive || onRestore || onDelete);
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

      {/* Row-actions "⋯" menu (My History only). Sits ABOVE the card's click overlay so its
          clicks open the menu instead of the detail modal. */}
      {hasActions && (
        <RowActionsMenu
          isArchived={isArchived}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      )}

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

        <p style={{ margin: "0 0 6px", fontSize: "0.8em", color: "var(--text-dim)",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>Reported by {report.reported_by ?? "you"}{when ? ` · ${when}` : ""}</span>
          {/* Show HOW it was reported when it came in by forwarded email (vs the web form). */}
          {report.source === "email" && (
            <span title="Forwarded by email" style={{ display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: "0.92em", color: "var(--primary)", background: "var(--canvas)",
              border: "1px solid var(--border)", borderRadius: 999, padding: "1px 8px" }}>
              <Mail size={12} /> Email
            </span>
          )}
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

// The "⋯" row-actions menu for a My History card: Archive/Restore + Delete. Kept in this file
// (not shared) because it only makes sense on a personal report row. Every button calls
// stopPropagation so a click acts on the menu, never the card's open-modal overlay underneath.
const RowActionsMenu = ({ isArchived, onArchive, onRestore, onDelete }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  // Close the menu and return focus to the trigger, so keyboard users aren't stranded when the
  // focused menu item unmounts (Escape / outside-click / after running an action).
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Escape closes. (Outside-click is handled by the transparent backdrop below, NOT a document
  // listener — that way the dismiss click is swallowed and can't also fall through to the card's
  // open-modal overlay underneath.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Run one action then close. stopPropagation keeps the click off the card overlay.
  const run = (fn) => (e) => {
    e.stopPropagation();
    close();
    fn?.();
  }

  return (
    <div style={{ position: "absolute", top: 10, right: 10, zIndex: 2 }}>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="Report options"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ border: "none", background: "var(--surface)", cursor: "pointer",
          color: "var(--text-dim)", display: "grid", placeItems: "center", padding: 4,
          borderRadius: 8 }}
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <>
          {/* Invisible full-screen backdrop: an outside click lands HERE (dismiss + stopPropagation)
              instead of bubbling to the card overlay, so dismissing the menu never also opens the
              detail modal. */}
          <div
            onClick={(e) => { e.stopPropagation(); close(); }}
            style={{ position: "fixed", inset: 0, zIndex: 2 }}
          />
          <div role="menu" style={{ position: "absolute", top: "100%", right: 0, zIndex: 3, minWidth: 160,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "var(--shadow)", padding: 4 }}>
            {/* Archived rows offer "Restore"; active rows offer "Archive". */}
            {isArchived ? (
              <button role="menuitem" onClick={run(onRestore)} style={menuItemStyle}>
                <ArchiveRestore size={14} /> Restore
              </button>
            ) : (
              <button role="menuitem" onClick={run(onArchive)} style={menuItemStyle}>
                <Archive size={14} /> Archive
              </button>
            )}
            {/* Delete is only rendered when the parent passes onDelete (individuals only). */}
            {onDelete && (
              <button role="menuitem" onClick={run(onDelete)} style={{ ...menuItemStyle, color: "var(--danger)" }}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// One row inside the ⋯ menu (mirrors the sidebar's menuItemStyle so both menus match).
const menuItemStyle = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
  padding: "7px 10px", borderRadius: 8, border: "none", background: "none",
  cursor: "pointer", fontSize: "0.9em", color: "inherit",
};

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
