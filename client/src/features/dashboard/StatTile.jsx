// ── feature: dashboard · StatTile · owner: Michael ──
// One stat card in the top row of the dashboard. Data-driven, three shapes:
//   • plain number/text value (safety score)
//   • value + a trend chip ("8.4% ↑" green up / red down) — checks, threats
//   • value + a progress bar (checks remaining N/limit)
// Colors come only from theme tokens (never hard-coded hex).
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatTile({ label, value, sub, trend, progress }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 96,
      }}
    >
      <span
        style={{
          fontSize: "0.72em",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-dim)",
        }}
      >
        {label}
      </span>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "2em", fontWeight: 800, color: "var(--navy)", lineHeight: 1 }}>
          {value}
        </span>
        {trend && <TrendChip trend={trend} />}
      </div>

      {sub && <span style={{ fontSize: "0.78em", color: "var(--text-dim)" }}>{sub}</span>}

      {progress != null && (
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: "var(--border)",
            overflow: "hidden",
            marginTop: 2,
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: "100%",
              background: "var(--primary)",
              borderRadius: 999,
            }}
          />
        </div>
      )}
    </div>
  );
}

// Small green-up / red-down percentage chip. "flat" renders nothing loud.
function TrendChip({ trend }) {
  if (!trend || trend.direction === "flat") {
    return <span style={{ fontSize: "0.75em", color: "var(--text-dim)" }}>—</span>;
  }
  const up = trend.direction === "up";
  const color = up ? "var(--safe)" : "var(--danger)";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontSize: "0.8em", fontWeight: 700 }}>
      <Icon size={14} strokeWidth={2.5} />
      {trend.pct}%
    </span>
  );
}
