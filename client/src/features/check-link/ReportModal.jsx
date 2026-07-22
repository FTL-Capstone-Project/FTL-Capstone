import { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { X, Flag, Users } from "lucide-react";
import { api } from "../../lib/api.js";

// ── Report-it modal · owner: David ──
// Opened from VerdictCard's "Report it" (works for any verdict — safe / review / dangerous).
// Asks the user WHY they're reporting (free text, capped at 200 words with a live counter) so we
// collect better signal, and shows the LIVE count of how many people have reported this same
// thing — the framing being that many reports across users on the same indicator surface it to the
// (portrayed) global security team, who address the top threats. All theme tokens (var(--...)) so
// it follows light/dark automatically. On submit it POSTs the reason to /api/indicators/:id/report
// and hands the updated { reported_count, global_review_status } back to the card.

const WORD_LIMIT = 200;
const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const ReportModal = ({ indicatorId, currentCount = 0, onClose, onReported }) => {
  const { getToken } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const textRef = useRef(null);

  const words = countWords(reason);
  const overLimit = words > WORD_LIMIT;

  // Focus the textarea on open; close on Escape. (Mirrors ReportDetailModal's a11y basics.)
  useEffect(() => {
    textRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (submitting || overLimit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post(`/api/indicators/${indicatorId}/report`,
        { reason: reason.trim() || undefined }, { getToken });
      onReported?.(res); // { reported_count, global_review_status }
      onClose();
    } catch (e) {
      setError(e.body?.error || "Couldn't submit your report just now. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Report this to the security team"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,37,64,0.45)",
        display: "grid", placeItems: "center", padding: 16 }}>
      <div ref={dialogRef} style={{ background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow)",
        width: "100%", maxWidth: 460, border: "1px solid var(--border)", overflow: "hidden" }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 12, padding: "18px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10,
              background: "rgba(178,134,0,0.14)", color: "var(--review)" }}><Flag size={18} /></span>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05em", fontWeight: 800, color: "var(--navy)" }}>Report this</h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.8em", color: "var(--text-dim)" }}>
                Flag it for the Orbis security team to review.
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none",
              background: "var(--canvas)", color: "var(--text-dim)", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "14px 20px 20px" }}>
          {/* live count of how many people flagged this same thing */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--canvas)",
            border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}>
            <Users size={15} style={{ color: "var(--primary)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.82em", color: "var(--text-dim)", lineHeight: 1.45 }}>
              {currentCount > 0
                ? <><b style={{ color: "var(--text)" }}>{currentCount}</b> {currentCount === 1 ? "person has" : "people have"} reported this. The security team prioritizes what's reported most.</>
                : <>Be the first to report this. Repeated reports across users help the security team spot the top threats.</>}
            </span>
          </div>

          <label htmlFor="report-reason" style={{ display: "block", fontSize: "0.85em", fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
            Why are you reporting it? <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional, helps us investigate)</span>
          </label>
          <textarea id="report-reason" ref={textRef} value={reason} rows={4}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. This asked me for my bank login, or the sender pretended to be my bank…"
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "10px 12px",
              border: `1px solid ${overLimit ? "var(--danger)" : "var(--border)"}`, borderRadius: 10,
              fontSize: "0.9em", fontFamily: "inherit", color: "var(--text)", background: "var(--surface)", lineHeight: 1.5 }} />

          {/* live word counter */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, minHeight: 18 }}>
            <span style={{ fontSize: "0.78em", color: "var(--danger)" }}>{error}</span>
            <span style={{ fontSize: "0.78em", color: overLimit ? "var(--danger)" : "var(--text-dim)" }}>
              {words} / {WORD_LIMIT} words
            </span>
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={onClose} disabled={submitting}
              style={{ padding: "9px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.88em", cursor: "pointer",
                border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)" }}>
              Cancel
            </button>
            <button onClick={submit} disabled={submitting || overLimit}
              style={{ padding: "9px 18px", borderRadius: 10, fontWeight: 700, fontSize: "0.88em",
                cursor: submitting || overLimit ? "default" : "pointer", opacity: submitting || overLimit ? 0.6 : 1,
                border: "1.5px solid var(--review)", background: "var(--review)", color: "#fff",
                display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Flag size={14} /> {submitting ? "Reporting…" : "Submit report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
