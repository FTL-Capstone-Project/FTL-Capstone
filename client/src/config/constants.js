// App-wide constants — one home for magic strings/numbers.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// How often CheckResult re-polls the indicator while a scan runs (ms).
export const POLL_INTERVAL_MS = 1500;

// Sidebar nav per role (§4 / DESIGN_SPEC). Each item: label, sublabel, path, icon.
// The chat is "Ask Orbo" at /ask-orbo (the canonical Home). Individuals & members lead
// with it; analysts lead with Dashboard then Ask Orbo.
export const NAV_BY_ROLE = {
  individual: [
    { label: "Ask Orbo", sub: "Chat with Orbo", to: "/ask-orbo", icon: "✦" },
    { label: "Reports", sub: "Full check history", to: "/reports", icon: "🗎" },
    { label: "Dashboard", sub: "Your safety stats", to: "/dashboard", icon: "▦" },
  ],
  member: [
    { label: "Ask Orbo", sub: "Chat with Orbo", to: "/ask-orbo", icon: "✦" },
    { label: "Reports", sub: "Full check history", to: "/reports", icon: "🗎" },
    { label: "Dashboard", sub: "Your safety stats", to: "/dashboard", icon: "▦" },
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
