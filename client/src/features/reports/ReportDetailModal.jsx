import { useEffect, useState, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { X, ShieldCheck, Clock } from "lucide-react";
import { api } from "../../lib/api.js";
import StatusBadge from "../../components/StatusBadge.jsx";
import StatusChip from "./StatusChip.jsx";

// ── Report detail modal (wireframes: "Orbis Reports_Page - Modal_Overlay") ──
// Opens when a report card is clicked. Shows the full verdict for one checked link.
//
// TWO PERSONA VARIANTS (this week's focus — individual + org member):
//   • individual (isMember=false): ONE "Orbo score" card (the AI verdict). No analyst.
//   • org member (isMember=true):  TWO cards — "Orbo score" AND "Analyst score".
//       - analyst HAS scored  → show the human score + "Scored by <analyst name>".
//       - analyst NOT yet     → "Awaiting analyst review" + the closure StatusChip.
//
// DATA: the parent (Reports.jsx) passes the list row it already has (`report`) so the
// modal renders instantly AND has the analyst's NAME (the detail endpoint omits it).
// On open we ALSO fetch GET /api/indicators/:id for the richer fields the list row
// doesn't carry (full ai_verdict, evidence/threat vectors, confidence, domain).

// Verdict word from a 0-100 SAFETY score (100 = safe). Mirrors David's scoreBucket.
function scoreKind(score) {
  if (score == null) return "review";
  if (score >= 70) return "safe";
  if (score >= 35) return "review";
  return "dangerous";
}

const KIND_COLOR = { safe: "var(--safe)", review: "var(--review)", dangerous: "var(--danger)" };

// Threat-vector bar fill by severity. We have a severity per reason (not a measured %),
// so the bar length is QUALITATIVE (higher = more severe) — we deliberately show no
// fabricated percentage number. Reflects the wireframe's bar look, honestly.
const SEVERITY_FILL = { dangerous: 92, review: 58, safe: 28 };

export default function ReportDetailModal({ report, isMember = false, onClose }) {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState(null); // richer fields from GET /api/indicators/:id
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false); // detail fetch errored → show a note
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  const prevFocusRef = useRef(null);
  // Read onClose through a ref so the mount effect below can have an EMPTY dep array
  // (it must run once, not re-run every time the parent hands us a new onClose fn).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Fetch the full indicator detail on open (evidence, full verdict, confidence, domain).
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFetchFailed(false);
    api.get(`/api/indicators/${report.indicator_id}`, { getToken })
      .then((data) => { if (active) setDetail(data); })
      .catch(() => { if (active) { setDetail(null); setFetchFailed(true); } }) // fall back to the list row
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [report.indicator_id, getToken]);

  // Modal behavior (runs ONCE for the modal's lifetime — empty deps): Escape closes,
  // body scroll locks, focus moves to the close button on open and is restored on close.
  // Tab/Shift+Tab is TRAPPED inside the dialog so keyboard focus can't reach the
  // obscured page behind the overlay.
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e) {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      // Keep focus cycling among the dialog's focusable elements.
      const focusables = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocusRef.current?.focus?.();
    };
  }, []);

  // ── Merge list row + fetched detail (detail wins where present) ──
  const title = report.title || detail?.title || report.url;
  const url = report.url || detail?.domain || "";
  const screenshotUrl = detail?.screenshot_url ?? report.screenshot_url ?? null;
  const aiScore = detail?.ai_score ?? report.ai_score ?? null;
  const kind = scoreKind(aiScore);
  // Full safety-analysis text: prefer the fuller ai_verdict, fall back to the card's description.
  const analysis = detail?.ai_verdict || report.description || null;
  // Threat vectors: prefer the fetched detail; fall back to the list row's evidence if
  // the parent supplied it (so a failed detail fetch doesn't blank the section).
  const evidence = Array.isArray(detail?.evidence) ? detail.evidence
    : Array.isArray(report.evidence) ? report.evidence
    : [];

  // Analyst review data. Name comes from the LIST row (detail omits it); score/status
  // prefer whichever source has them.
  const analystName = report.review?.reviewed_by ?? null;
  const analystScore = report.review?.human_score ?? detail?.review?.human_score ?? null;
  const reviewStatus = detail?.review?.review_status ?? report.review?.review_status ?? "pending review";
  const analystHasScored = analystScore != null;

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,37,64,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "40px 16px", overflowY: "auto" }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        style={{ background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow)",
          width: "100%", maxWidth: 640, maxHeight: "calc(100vh - 80px)", overflowY: "auto",
          padding: 28 }}
      >
        {/* ── Header: title + verdict badge + close ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <h2 id="report-modal-title" style={{ margin: 0, flex: 1, minWidth: 0, fontSize: "1.35em",
            color: "var(--navy)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            overflowWrap: "anywhere" }}>
            {title}
            <StatusBadge kind={kind} />
          </h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: "none",
              cursor: "pointer", background: "var(--canvas)", color: "var(--text-dim)",
              display: "grid", placeItems: "center" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Screenshot preview in browser chrome ── */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden",
          marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
            background: "var(--canvas)", borderBottom: "1px solid var(--border)" }}>
            <span style={{ display: "flex", gap: 5 }} aria-hidden>
              {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.5 }} />
              ))}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: "0.82em", color: KIND_COLOR[kind],
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {url}
            </span>
          </div>
          {screenshotUrl ? (
            <img src={screenshotUrl} alt="Sandbox preview of where this link leads"
              style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "cover", objectPosition: "top" }} />
          ) : (
            <div style={{ height: 200, background: "var(--border)", display: "grid", placeItems: "center",
              color: "var(--text-dim)", fontSize: "0.85em" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={16} /> No sandbox preview available
              </span>
            </div>
          )}
        </div>

        {/* ── Score card(s): the persona difference lives here ── */}
        <div style={{ display: "grid", gap: 12, marginBottom: 24,
          gridTemplateColumns: isMember ? "1fr 1fr" : "1fr" }}>
          {/* Orbo (AI) score — shown to everyone */}
          <ScoreCard label="Orbo score" score={aiScore} kind={kind} subtitle="Scored by Orbo (AI)" />

          {/* Analyst score — ORG MEMBERS ONLY */}
          {isMember && (
            analystHasScored ? (
              <ScoreCard
                label="Analyst score"
                score={analystScore}
                kind={scoreKind(analystScore)}
                subtitle={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Scored by
                    <span aria-hidden style={{ width: 14, height: 14, borderRadius: "50%",
                      background: "var(--primary)", display: "inline-block" }} />
                    <strong style={{ color: "var(--navy)" }}>{analystName ?? "an analyst"}</strong>
                  </span>
                }
              />
            ) : (
              // Waiting-for-analyst state (story #7: closure hasn't happened yet).
              <div style={cardStyle}>
                <div style={cardLabelStyle}>Analyst score</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  padding: "8px 0" }}>
                  <Clock size={26} color="var(--text-dim)" />
                  <StatusChip status={reviewStatus} />
                </div>
                <div style={cardSubtitleStyle}>Awaiting analyst review</div>
              </div>
            )
          )}
        </div>

        {/* ── Safety analysis ── */}
        {analysis && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={sectionHeadingStyle}>Safety analysis</h3>
            <p style={{ margin: 0, color: "var(--text-dim)", lineHeight: 1.6 }}>{analysis}</p>
          </section>
        )}

        {/* ── Threat vectors (real evidence rows; bar length reflects severity) ── */}
        {evidence.length > 0 ? (
          <section>
            <h3 style={sectionHeadingStyle}>Threat vectors</h3>
            <div style={{ display: "grid", gap: 14 }}>
              {evidence.map((item, i) => (
                <ThreatVector key={i} text={item.text} severity={item.severity} />
              ))}
            </div>
          </section>
        ) : loading ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.88em" }}>Loading details…</p>
        ) : fetchFailed ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.88em" }}>
            Couldn't load the full threat details — try reopening this report.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// One "Orbo score" / "Analyst score" card: big number /100 + a subtitle line.
function ScoreCard({ label, score, kind, subtitle }) {
  return (
    <div style={cardStyle}>
      <div style={cardLabelStyle}>{label}</div>
      <div style={{ textAlign: "center", margin: "6px 0" }}>
        <span style={{ fontSize: "2.6em", fontWeight: 800, color: KIND_COLOR[kind] }}>
          {score ?? "—"}
        </span>
        <span style={{ fontSize: "1em", color: "var(--text-dim)" }}>/100</span>
      </div>
      <div style={cardSubtitleStyle}>{subtitle}</div>
    </div>
  );
}

// A single threat-vector row: label + severity-colored bar (qualitative, no fake %).
function ThreatVector({ text, severity }) {
  const color = KIND_COLOR[severity] ?? "var(--primary)";
  const fill = SEVERITY_FILL[severity] ?? 50;
  return (
    <div>
      <div style={{ fontSize: "0.92em", color: "var(--text)", marginBottom: 6 }}>{text}</div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${fill}%`, height: "100%", borderRadius: 999, background: color }} />
      </div>
    </div>
  );
}

// ── shared inline style objects (keeps the JSX readable) ──
const cardStyle = {
  background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: 12, padding: 16,
  display: "flex", flexDirection: "column", justifyContent: "space-between",
};
const cardLabelStyle = { textAlign: "center", color: "var(--text-dim)", fontSize: "0.85em" };
const cardSubtitleStyle = {
  textAlign: "center", color: "var(--text-dim)", fontSize: "0.8em",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
};
const sectionHeadingStyle = { margin: "0 0 10px", color: "var(--navy)", fontSize: "1.05em" };
