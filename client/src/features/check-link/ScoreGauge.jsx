// 0–100 risk gauge. Simple numeric version for now; TODO(David): make it a real dial/ring.
export default function ScoreGauge({ score, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "2.2em", fontWeight: 800, color }}>{score ?? "—"}</div>
      <div style={{ fontSize: "0.7em", color: "var(--text-dim)", textTransform: "uppercase",
        letterSpacing: "0.06em" }}>Risk score</div>
    </div>
  );
}
