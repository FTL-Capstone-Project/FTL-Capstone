import { useState } from "react";
import { VERDICT_STYLES } from "../../config/constants.js";
import StatusBadge from "../../components/StatusBadge.jsx";
import ScoreGauge from "./ScoreGauge.jsx";
import EvidenceList from "./EvidenceList.jsx";
import ScreenshotReader from "./ScreenshotReader.jsx";

// Maps a 0–100 score to a verdict bucket. TODO(David): confirm thresholds with the team.
function bucket(score) {
  if (score == null) return "review";
  if (score >= 70) return "dangerous";
  if (score >= 35) return "review";
  return "safe";
}

// The verdict card, rendered INSIDE the chat as Orbo's response (wireframe: Report_Response).
// badge + risk gauge + plain-English verdict + safe screenshot + "why" + action buttons.
// onAskMore(): lets the chat start a follow-up question. onAction(kind): Report it / Mark safe.
export default function VerdictCard({ indicator, onAskMore, onAction }) {
  const { ai_score, ai_verdict, ai_confidence, screenshot_url, report_count, evidence } = indicator;
  const kind = bucket(ai_score);
  const style = VERDICT_STYLES[kind];

  // urlscan screenshots are best-effort and can lag the verdict: retry once, then hide.
  const [shotSrc, setShotSrc] = useState(screenshot_url);
  const [shotOk, setShotOk] = useState(true);
  const [retried, setRetried] = useState(false);
  function handleShotError() {
    if (!retried) { setRetried(true); setTimeout(() => setShotSrc(`${screenshot_url}?r=${Date.now()}`), 2500); }
    else setShotOk(false);
  }

  return (
    <div style={{ background: style.bg, border: `1px solid ${style.color}33`,
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
          <p style={{ fontSize: "0.85em", color: "var(--text-dim)" }}>
            👁 Orbo has seen this before — reported {report_count} times.
          </p>
        )}

        {screenshot_url && shotOk && (
          <figure style={{ margin: "12px 0 0" }}>
            <img src={shotSrc} alt="Screenshot of where this link leads" loading="lazy" onError={handleShotError}
              style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }} />
            <figcaption style={{ fontSize: "0.78em", color: "var(--text-dim)", marginTop: 6 }}>
              🛡 Preview of the page, opened safely in a sandbox — you never had to visit it.
            </figcaption>
            <ScreenshotReader screenshotUrl={screenshot_url} />
          </figure>
        )}

        <EvidenceList items={evidence} />

        {/* Action buttons (wireframe: Report it · Mark safe · Ask Orbo more) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          <button onClick={() => onAction?.("report")} style={btn(style.color, true)}>Report it</button>
          <button onClick={() => onAction?.("safe")} style={btn(style.color, false)}>Mark safe</button>
          <button onClick={() => onAskMore?.()} style={btn("var(--primary)", false)}>Ask Orbo more</button>
        </div>
      </div>
    </div>
  );
}

function btn(color, filled) {
  return {
    padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.88em", cursor: "pointer",
    border: `1.5px solid ${color}`,
    background: filled ? color : "transparent",
    color: filled ? "#fff" : color,
  };
}
