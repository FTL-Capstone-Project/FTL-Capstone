// ── feature: dashboard · DashboardEmpty · owner: Michael ──
// Shown when the signed-in user has ZERO checks yet. Rather than render a
// dashboard full of empty charts/zeros (which reads as broken), we show one
// friendly card that points them at their first check. Once they run a check,
// the real dashboard takes over automatically.
import { Link } from "react-router-dom";
import orboWave from "../../assets/orbo/orbo-wave.png";

const DashboardEmpty = () => {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: "48px 32px",
        textAlign: "center",
        maxWidth: 520,
        margin: "24px auto",
      }}
    >
      <img src={orboWave} alt="" width={88} height={88} style={{ objectFit: "contain", marginBottom: 8 }} />
      <h2 style={{ color: "var(--navy)", margin: "0 0 8px" }}>No stats yet</h2>
      <p style={{ color: "var(--text-dim)", fontSize: "0.95em", margin: "0 0 24px", lineHeight: 1.5 }}>
        Your safety stats, results, and history will appear here once you run your first check.
        Paste a suspicious link or email and Orbo will take it from there.
      </p>
      <Link
        to="/ask-orbo?new=1"
        style={{
          display: "inline-block",
          background: "var(--primary)",
          color: "#fff",
          fontWeight: 700,
          textDecoration: "none",
          padding: "12px 28px",
          borderRadius: 999,
        }}
      >
        Run your first check →
      </Link>
    </div>
  );
}

export default DashboardEmpty;
