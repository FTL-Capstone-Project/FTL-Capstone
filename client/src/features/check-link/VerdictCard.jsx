import { useState } from "react";
import { VERDICT_STYLES } from "../../config/constants.js";
import StatusBadge from "../../components/StatusBadge.jsx";
import ScoreGauge from "./ScoreGauge.jsx";
import EvidenceList from "./EvidenceList.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

// Maps a 0–100 score to a verdict bucket. TODO(David): confirm thresholds with the team.
function bucket(score) {
  if (score == null) return "review";
  if (score >= 70) return "dangerous";
  if (score >= 35) return "review";
  return "safe";
}

// Verdict bucket → the Orbo pose that matches the mood.
const VERDICT_POSE = { safe: "safe", review: "caution", dangerous: "danger" };

// The result card: badge + score + Orbo's plain-English verdict + screenshot + evidence.
export default function VerdictCard({ indicator }) {
  const { ai_score, ai_verdict, screenshot_url, report_count, evidence } = indicator;
  const kind = bucket(ai_score);
  const style = VERDICT_STYLES[kind];

  // urlscan screenshots are best-effort and can lag a few seconds behind the verdict.
  // On error: retry once with a cache-busting param after a short delay; if it still
  // fails, hide the image (no broken-image icon).
  const [shotSrc, setShotSrc] = useState(screenshot_url);
  const [shotOk, setShotOk] = useState(true);
  const [retried, setRetried] = useState(false);

  function handleShotError() {
    if (!retried) {
      setRetried(true);
      setTimeout(() => setShotSrc(`${screenshot_url}?r=${Date.now()}`), 2500);
    } else {
      setShotOk(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
      borderTop: `4px solid ${style.color}`, // color the top edge to the verdict at a glance
      borderRadius: "var(--radius)", boxShadow: "var(--shadow)", padding: 20, maxWidth: 560, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <OrboAvatar pose={VERDICT_POSE[kind]} size={72} />
          <StatusBadge kind={kind} />
        </div>
        <ScoreGauge score={ai_score} color={style.color} />
      </div>

      <p style={{ margin: "14px 0", color: "var(--text)", lineHeight: 1.5 }}>
        {ai_verdict ?? "Verdict unavailable — please review manually."}
      </p>

      {report_count > 1 && (
        <p style={{ fontSize: "0.85em", color: "var(--text-dim)" }}>
          👁 Orbo has seen this before — reported {report_count} times.
        </p>
      )}

      {screenshot_url && shotOk && (
        <figure style={{ margin: "12px 0 0" }}>
          <img
            src={shotSrc}
            alt="Screenshot of where this link leads"
            loading="lazy"
            onError={handleShotError}
            style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
          />
          <figcaption style={{ fontSize: "0.78em", color: "var(--text-dim)", marginTop: 6 }}>
            🛡 Preview of the page, opened safely in a sandbox — you never had to visit it.
          </figcaption>
        </figure>
      )}

      <EvidenceList items={evidence} />
    </div>
  );
}
