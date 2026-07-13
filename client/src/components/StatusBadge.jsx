import { VERDICT_STYLES } from "../config/constants.js";

// Verdict badge: ALWAYS icon + word + color together (accessibility — never color alone).
// `kind` = "safe" | "review" | "dangerous".
export default function StatusBadge({ kind = "review" }) {
  const s = VERDICT_STYLES[kind] ?? VERDICT_STYLES.review;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: s.bg,
      color: s.color, fontWeight: 700, fontSize: "0.8em", padding: "3px 10px", borderRadius: 999 }}>
      <span aria-hidden>{s.icon}</span> {s.label}
    </span>
  );
}
