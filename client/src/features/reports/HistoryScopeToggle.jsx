import { User, Users } from "lucide-react";

// "My History | Team History" toggle for the Reports page (org members only).
// Matches the Organizational wireframe: the two options sit top-right of the
// title; the active one is navy with a blue underline, the other is dimmed.
//
// Controlled component: the parent (Reports.jsx) owns the `scope` state
// ("mine" | "team") and passes `onChange` to switch which dataset shows.
// It renders NO data itself — it only flips a value, keeping it reusable.
const OPTIONS = [
  { value: "mine", label: "My History",   Icon: User },
  { value: "team", label: "Team History", Icon: Users },
];

export default function HistoryScopeToggle({ scope, onChange }) {
  return (
    <div style={{ display: "flex", gap: 20 }}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = scope === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: "4px 2px",
              fontSize: "0.9em",
              fontWeight: 600,
              // Active = navy text + blue underline; inactive = dimmed, no line.
              color: isActive ? "var(--navy)" : "var(--text-dim)",
              borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
