import { VERDICT_STYLES } from "../../config/constants.js";
import StatusBadge from "../../components/StatusBadge.jsx";
import ScoreGauge from "./ScoreGauge.jsx";
import EvidenceList from "./EvidenceList.jsx";

// Maps a 0–100 score to a verdict bucket. TODO(David): confirm thresholds with the team.
function bucket(score) {
  if (score == null) return "review";
  if (score >= 70) return "dangerous";
  if (score >= 35) return "review";
  return "safe";
}

// The result card: badge + score + Orbo's plain-English verdict + screenshot + evidence.
export default function VerdictCard({ indicator }) {
  const { ai_score, ai_verdict, screenshot_url, report_count, evidence } = indicator;
  const kind = bucket(ai_score);
  const style = VERDICT_STYLES[kind];

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", boxShadow: "var(--shadow)", padding: 20, maxWidth: 560, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <StatusBadge kind={kind} />
        <ScoreGauge score={ai_score} color={style.color} />
      </div>

      <p style={{ margin: "14px 0", color: "var(--text)" }}>
        {ai_verdict ?? "Verdict unavailable — please review manually."}
      </p>

      {report_count > 1 && (
        <p style={{ fontSize: "0.85em", color: "var(--text-dim)" }}>
          👁 Orbo has seen this before — reported {report_count} times.
        </p>
      )}

      {screenshot_url && (
        <img src={screenshot_url} alt="Screenshot of where this link leads"
          style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", margin: "12px 0" }} />
      )}

      <EvidenceList items={evidence} />
    </div>
  );
}
