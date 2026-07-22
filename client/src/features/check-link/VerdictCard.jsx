import { useState, useEffect } from "react";
import { Eye, ShieldCheck, Flag, Clock } from "lucide-react";
import { VERDICT_STYLES } from "../../config/constants.js";
import StatusBadge from "../../components/StatusBadge.jsx";
import ScoreGauge from "./ScoreGauge.jsx";
import EvidenceList from "./EvidenceList.jsx";
import ScreenshotReader from "./ScreenshotReader.jsx";
import ReportModal from "./ReportModal.jsx";

// Maps a 0–100 SAFETY score to a verdict bucket (100 = safe, matches the DB/whole app).
// High score = safe; low = dangerous.
const bucket = (score) => {
  if (score == null) return "review";
  if (score >= 70) return "safe";
  if (score >= 35) return "review";
  return "dangerous";
}

// The verdict card, rendered INSIDE the chat as Orbo's response (wireframe: Report_Response).
// badge + safety gauge + plain-English verdict + safe screenshot + "why" + action buttons.
//   onAskMore()  — lets the chat start a follow-up question.
//   indicatorId  — the DB id of this check. Needed for "Report it". Sender reports are
//                  ephemeral (no persisted indicator), so they pass none → no Report button.
const VerdictCard = ({ indicator, onAskMore, indicatorId }) => {
  const { ai_score, ai_verdict, ai_confidence, screenshot_url, report_count, evidence } = indicator;
  const kind = bucket(ai_score);
  const style = VERDICT_STYLES[kind];

  // The indicator id to report on: the explicit prop (link scans) OR indicator.indicator_id, which
  // sender reports now carry (they persist to the same Indicator table as links). So "Report it"
  // works for sender reports too, not just URL checks.
  const reportId = indicatorId ?? indicator.indicator_id ?? null;

  // "Report it" state: opens a modal that collects a WHY reason before flagging for the global
  // security-team review. Seed from the server so a URL already under review shows that on load.
  const [reviewStatus, setReviewStatus] = useState(indicator.global_review_status ?? null);
  const [reportedCount, setReportedCount] = useState(indicator.reported_count ?? 0);
  const [modalOpen, setModalOpen] = useState(false);
  const canReport = reportId != null;
  const underReview = reviewStatus === "pending review";

  // The modal owns the POST; on success it hands back the updated count + status.
  const handleReported = (res) => {
    setReviewStatus(res?.global_review_status ?? "pending review");
    if (typeof res?.reported_count === "number") setReportedCount(res.reported_count);
  }

  // urlscan screenshots are best-effort and can lag the verdict: retry once, then hide.
  const [shotSrc, setShotSrc] = useState(screenshot_url);
  const [shotOk, setShotOk] = useState(true);
  const [retried, setRetried] = useState(false);
  // Belt-and-suspenders: if this component instance is ever reused for a DIFFERENT check
  // (screenshot_url prop changes), re-sync the local image state so we never show the
  // previous check's screenshot. (The conversation-scoped key in Home.jsx is the primary
  // fix; this makes the card correct even if it isn't remounted.)
  useEffect(() => {
    setShotSrc(screenshot_url);
    setShotOk(true);
    setRetried(false);
    setReviewStatus(indicator.global_review_status ?? null);
    setReportedCount(indicator.reported_count ?? 0);
  }, [screenshot_url, indicator.global_review_status]);
  const handleShotError = () => {
    if (!retried) { setRetried(true); setTimeout(() => setShotSrc(`${screenshot_url}?r=${Date.now()}`), 2500); }
    else setShotOk(false);
  }

  return (
    // The inline background/border below are the fallback; global.css .verdict-frame
    // overrides them (both themes) into a glowing LED-strip border in the verdict color
    // (matcha-milk green for Safe). data-kind selects which LED color.
    <div className="verdict-frame" data-kind={kind}
      style={{ background: style.bg, border: `1px solid ${style.color}33`,
      borderRadius: 16, boxShadow: "var(--shadow)", padding: 18, width: "100%" }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <StatusBadge kind={kind} />
          <div style={{ textAlign: "center" }}>
            <ScoreGauge score={ai_score} color={style.color} />
            {ai_confidence && (
              <div style={{ fontSize: "0.68em", color: "var(--text-dim)", marginTop: 2 }}>
                Confidence: {ai_confidence}
              </div>
            )}
          </div>
        </div>

        <p style={{ margin: "12px 0", color: "var(--text)", lineHeight: 1.5 }}>
          {ai_verdict ?? "Verdict unavailable — please review manually."}
        </p>

        {report_count > 1 && (
          <p style={{ fontSize: "0.85em", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
            <Eye size={14} /> Orbo has seen this before — reported {report_count} times.
          </p>
        )}

        {screenshot_url && shotOk && (
          <figure style={{ margin: "12px 0 0" }}>
            <img src={shotSrc} alt="Screenshot of where this link leads" loading="lazy" onError={handleShotError}
              style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }} />
            <figcaption style={{ fontSize: "0.78em", color: "var(--text-dim)", marginTop: 6,
              display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} style={{ flexShrink: 0 }} /> Preview of the page, opened safely in a sandbox — you never had to visit it.
            </figcaption>
            <ScreenshotReader screenshotUrl={screenshot_url} />
          </figure>
        )}

        <EvidenceList items={evidence} />

        {/* "Under review" banner once this indicator has been reported to the security team. */}
        {underReview && (
          <p style={{ marginTop: 14, fontSize: "0.85em", color: "var(--review)", display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} /> Reported — a security reviewer will take a closer look at this.
            {reportedCount > 1 && ` (${reportedCount} reports so far)`}
          </p>
        )}

        {/* Action buttons. Report it → global security-team review. Mark safe = the
            community "I trust this" flow, coming soon (disabled for now). */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {canReport && (
            <button onClick={() => setModalOpen(true)} disabled={underReview}
              style={btn(style.color, true, underReview)}>
              <Flag size={14} /> {underReview ? "Reported" : "Report it"}
            </button>
          )}
          <button disabled title="Community trust notes are coming soon"
            style={btn(style.color, false, true)}>Mark safe</button>
          <button onClick={() => onAskMore?.()} style={btn("var(--primary)", false)}>Ask Orbo more</button>
        </div>
      </div>

      {modalOpen && (
        <ReportModal
          indicatorId={reportId}
          currentCount={reportedCount}
          onClose={() => setModalOpen(false)}
          onReported={handleReported}
        />
      )}
    </div>
  );
}

const btn = (color, filled, disabled = false) => {
  return {
    padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.88em",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: `1.5px solid ${color}`,
    background: filled ? color : "transparent",
    color: filled ? "#fff" : color,
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}

export default VerdictCard;
