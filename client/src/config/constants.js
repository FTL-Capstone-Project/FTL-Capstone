// App-wide constants — one home for magic strings/numbers.
import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";

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
    { label: "Insights", sub: "Ask your data (charts)", to: "/insights", icon: "📊" },
    { label: "Ask Orbo", sub: "Chat with Orbo", to: "/ask-orbo", icon: "✦" },
    { label: "Reports", sub: "Full check history", to: "/reports", icon: "🗎" },
  ],
};

// Verdict status → display label + theme token (used by StatusBadge/VerdictCard).
//
// The middle label is "Suspicious", NOT "Review": the Reports filter and the Insights band
// labels both already say "Suspicious", so a badge reading "Review" meant a user filtered by
// one word and got a row labeled another. One word, everywhere. (The DB value is still the
// string "review" — this is display text only.)
//
// `Icon` is a lucide-react COMPONENT, not a character. It used to be "✓ ⚠ ⛔" — and ⛔ is an
// emoji, which our code style forbids in rendered UI (they render differently per platform and
// screen readers announce them as words). StatusBadge renders <Icon /> beside the label; the
// icon + word together are what make the verdict readable without relying on color, which
// matters because our amber and green are close enough to be hard to tell apart for a
// red/green-colorblind reader.
export const VERDICT_STYLES = {
  safe:       { label: "Safe",       Icon: ShieldCheck,   color: "var(--safe)",   bg: "var(--safe-bg)" },
  review:     { label: "Suspicious", Icon: AlertTriangle, color: "var(--review)", bg: "var(--review-bg)" },
  dangerous:  { label: "Dangerous",  Icon: ShieldAlert,   color: "var(--danger)", bg: "var(--danger-bg)" },
};
