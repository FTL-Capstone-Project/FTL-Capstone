// App-wide constants — one home for magic strings/numbers.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// How often CheckResult re-polls the indicator while a scan runs (ms).
export const POLL_INTERVAL_MS = 1500;

// Sidebar nav per role (§4 / DESIGN_SPEC). Each item: label, sublabel, path, icon.
// Individuals & members lead with Home (chat); analysts lead with Dashboard, no Home.
export const NAV_BY_ROLE = {
  individual: [
    { label: "Home", sub: "Chat with Orbo", to: "/home", icon: "🏠" },
    { label: "Dashboard", sub: "Your safety stats", to: "/dashboard", icon: "▦" },
    { label: "Reports", sub: "Full check history", to: "/reports", icon: "🗎" },
  ],
  member: [
    { label: "Home", sub: "Chat with Orbo", to: "/home", icon: "🏠" },
    { label: "Dashboard", sub: "Your safety stats", to: "/dashboard", icon: "▦" },
    { label: "Reports", sub: "Full check history", to: "/reports", icon: "🗎" },
  ],
  analyst: [
    { label: "Dashboard", sub: "Your safety stats", to: "/dashboard", icon: "▦" },
    { label: "Ask Orbo", sub: "Chat with Orbo", to: "/ask-orbo", icon: "✦" },
    { label: "Reports", sub: "Full check history", to: "/reports", icon: "🗎" },
  ],
};

// Verdict status → display label + theme token (used by StatusBadge/VerdictCard).
export const VERDICT_STYLES = {
  safe:       { label: "Safe",       icon: "✓", color: "var(--safe)",   bg: "var(--safe-bg)" },
  review:     { label: "Review",     icon: "⚠", color: "var(--review)", bg: "var(--review-bg)" },
  dangerous:  { label: "Dangerous",  icon: "⛔", color: "var(--danger)", bg: "var(--danger-bg)" },
};
