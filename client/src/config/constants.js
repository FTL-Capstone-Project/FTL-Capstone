// App-wide constants — one home for magic strings/numbers.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// How often CheckResult re-polls the indicator while a scan runs (ms).
export const POLL_INTERVAL_MS = 1500;

// Verdict status → display label + theme token (used by StatusBadge/VerdictCard).
export const VERDICT_STYLES = {
  safe:       { label: "Safe",       icon: "✓", color: "var(--safe)",   bg: "var(--safe-bg)" },
  review:     { label: "Review",     icon: "⚠", color: "var(--review)", bg: "var(--review-bg)" },
  dangerous:  { label: "Dangerous",  icon: "⛔", color: "var(--danger)", bg: "var(--danger-bg)" },
};
