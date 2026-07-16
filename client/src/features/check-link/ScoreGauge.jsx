// 0–100 safety gauge (100 = safe). Simple numeric version for now; TODO(David): make it a real dial/ring.
const ScoreGauge = ({ score, color }) => {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "2.2em", fontWeight: 800, color }}>{score ?? "—"}</div>
      <div style={{ fontSize: "0.7em", color: "var(--text-dim)", textTransform: "uppercase",
        letterSpacing: "0.06em" }}>Safety score</div>
    </div>
  );
}

export default ScoreGauge;
