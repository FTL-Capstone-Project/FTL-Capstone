// ── feature: auth · account-type chooser · owner: Michael ──
// The screen a visitor reaches from the Landing "Get Started"/"Login" buttons.
// They pick who they are; each choice routes into the same shared sign-in page,
// tagged with the type so the sign-in footer shows the right option:
//   personal      → /signin?type=personal        footer: "Create an account"
//   organizational→ /signin?type=organizational   footer: "Create a personal account"
//   analyst       → /signin?type=analyst          footer: "Create a team" → /create-team
// Signed-in users never see this (App.jsx redirects them into the app).
import { useNavigate } from "react-router-dom";
import { User, Building2, ShieldCheck, ArrowRight } from "lucide-react";
import { AuthCard, PrivacyNote } from "./AuthKit.jsx";

const TYPES = [
  {
    key: "personal",
    Icon: User,
    title: "Personal",
    desc: "Check suspicious links and emails just for yourself.",
  },
  {
    key: "organizational",
    Icon: Building2,
    title: "Organizational",
    desc: "You're part of a team that uses Orbis. Sign in to your workspace.",
  },
  {
    key: "analyst",
    Icon: ShieldCheck,
    title: "Analyst",
    desc: "Security analyst or admin. Triage your org's threats, or create a team.",
  },
];

const ChooseAccountType = () => {
  const navigate = useNavigate();

  return (
    <AuthCard tagline="How will you use Orbis?">
      <div style={{ display: "grid", gap: 12 }}>
        {TYPES.map(({ key, Icon, title, desc }) => (
          <button
            key={key}
            onClick={() => navigate(`/signin?type=${key}`)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              textAlign: "left",
              padding: "16px 18px",
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: "pointer",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = "var(--primary)";
              event.currentTarget.style.boxShadow = "var(--shadow)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = "var(--border)";
              event.currentTarget.style.boxShadow = "none";
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 10,
                background: "var(--canvas)",
                display: "grid",
                placeItems: "center",
                color: "var(--primary)",
              }}
            >
              <Icon size={20} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, color: "var(--navy)" }}>{title}</span>
              <span style={{ display: "block", fontSize: "0.85em", color: "var(--text-dim)", lineHeight: 1.4 }}>
                {desc}
              </span>
            </span>
            <ArrowRight size={18} color="var(--primary)" style={{ marginLeft: "auto", flexShrink: 0 }} />
          </button>
        ))}
      </div>

      <PrivacyNote />
    </AuthCard>
  );
};

export default ChooseAccountType;
