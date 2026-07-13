// Escalation/closure status for org-member reports. TODO(Ozias): wire real review_status values.
const CHIPS = {
  "pending review":       { label: "Pending review", color: "var(--review)", bg: "var(--review-bg)" },
  "confirmed malicious":  { label: "Confirmed malicious", color: "var(--danger)", bg: "var(--danger-bg)" },
  "confirmed safe":       { label: "Confirmed safe", color: "var(--safe)", bg: "var(--safe-bg)" },
};

export default function StatusChip({ status }) {
  const c = CHIPS[status];
  if (!c) return null;
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: "0.75em", fontWeight: 700,
      padding: "2px 10px", borderRadius: 999 }}>{c.label}</span>
  );
}
