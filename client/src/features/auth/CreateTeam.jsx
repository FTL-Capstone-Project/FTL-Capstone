// ── feature: auth · Create Team (analyst/admin path) · owner: Michael ──
// UI ONLY, non-functional for now (per spec). Pixel-matches the two wireframes:
//   Step 1 — "Set up Orbis for your team" (company name, work email, password,
//            "auto-add anyone with your company email" toggle)  → Continue
//   Step 2 — "Invite your team" (teammate emails)               → Send invites / Skip
// Local step state only; "Continue"/"Send invites"/"Skip" don't call any API yet.
// When wired later: this becomes Clerk <CreateOrganization> + invitations.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AuthCard, Field, PrimaryButton, PrivacyNote } from "./AuthKit.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

const linkBtn = { border: "none", background: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", fontSize: "1em", padding: 0 };

// Two-segment progress indicator ("Step N of 2").
const ProgressBar = ({ current }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, margin: "6px 0 18px" }}>
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ width: 90, height: 5, borderRadius: 999, background: "var(--primary)" }} />
      <span style={{ width: 90, height: 5, borderRadius: 999, background: current >= 2 ? "var(--primary)" : "var(--border)" }} />
    </div>
    <span style={{ fontSize: "0.8em", color: "var(--text-dim)" }}>Step {current} of 2</span>
  </div>
);

// Little on/off pill toggle.
const Toggle = ({ on, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={on} style={{
    width: 44, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
    background: on ? "var(--primary)" : "var(--border)", position: "relative", flexShrink: 0, transition: "background 0.15s",
  }}>
    <span style={{
      position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%",
      background: "#fff", transition: "left 0.15s",
    }} />
  </button>
);

const Step1 = ({ onContinue, onPersonal }) => {
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [autoAdd, setAutoAdd] = useState(true);
  const domain = email.includes("@") ? email.split("@")[1] : "";

  return (
    <AuthCard
      footer={
        <p style={{ textAlign: "center", fontSize: "0.9em", color: "var(--text-dim)" }}>
          Just want it for yourself?{" "}
          <button onClick={onPersonal} style={linkBtn}>Create a personal account →</button>
        </p>
      }
    >
      <ProgressBar current={1} />
      <h2 style={{ textAlign: "center", color: "var(--navy)", margin: "0 0 6px" }}>Set up Orbis for your team</h2>
      <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9em", margin: "0 0 20px" }}>
        Protect your whole organization from scams — you'll be the admin.
      </p>

      <form onSubmit={(event) => { event.preventDefault(); onContinue(); }}>
        <Field label="Company or team name" value={company} onChange={setCompany} placeholder="Acme Inc." />
        <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@company.com"
          hint="Use your company email so teammates can find your workspace." />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••••••"
          hint="At least 15 characters" hintOk={password.length >= 15} />

        {/* Auto-add domain toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 18px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: "0.9em" }}>Auto-add anyone with your company email</div>
            <div style={{ fontSize: "0.8em", color: "var(--text-dim)" }}>
              Teammates who sign up with your company domain join automatically — no invites needed.
            </div>
          </div>
          {domain && (
            <span style={{ fontSize: "0.75em", color: "var(--safe)", background: "var(--safe-bg)", padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
              ● {domain}
            </span>
          )}
          <Toggle on={autoAdd} onClick={() => setAutoAdd((v) => !v)} />
        </div>

        <PrimaryButton>Continue →</PrimaryButton>
      </form>
      <PrivacyNote />
    </AuthCard>
  );
};

const Step2 = ({ onDone }) => {
  const [emails, setEmails] = useState("");
  return (
    <AuthCard>
      <ProgressBar current={2} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <OrboAvatar pose="safe" size={72} />
      </div>
      <h2 style={{ textAlign: "center", color: "var(--navy)", margin: "0 0 6px" }}>Invite your team</h2>
      <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9em", margin: "0 0 20px" }}>
        Add teammates now, or do it later — Orbis is ready either way.
      </p>

      <label style={{ display: "block", fontWeight: 700, color: "var(--navy)", fontSize: "0.9em", marginBottom: 6 }}>
        Teammate emails
      </label>
      <textarea
        value={emails}
        onChange={(event) => setEmails(event.target.value)}
        placeholder="jane@company.com, sam@company.com…"
        rows={4}
        style={{
          width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
          border: "1px solid var(--border)", fontSize: "0.95em", color: "var(--text)",
          resize: "vertical", fontFamily: "inherit",
        }}
      />
      <p style={{ margin: "6px 0 18px", fontSize: "0.8em", color: "var(--text-dim)" }}>Separate emails with commas.</p>

      <div style={{ display: "flex", gap: 12 }}>
        <PrimaryButton onClick={onDone} type="button">Send invites</PrimaryButton>
        <button onClick={onDone} type="button" style={{
          flexShrink: 0, padding: "13px 20px", borderRadius: 12, border: "1px solid var(--border)",
          background: "var(--surface)", color: "var(--navy)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          Skip for now <ArrowRight size={16} />
        </button>
      </div>
      <p style={{ textAlign: "center", margin: "16px 0 0", fontSize: "0.8em", color: "var(--text-dim)" }}>
        You can invite more people anytime from Settings.
      </p>
    </AuthCard>
  );
};

const CreateTeam = () => {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  return step === 1 ? (
    <Step1 onContinue={() => setStep(2)} onPersonal={() => navigate("/create-account?type=personal")} />
  ) : (
    <Step2 onDone={() => navigate("/signin?type=analyst")} />
  );
};

export default CreateTeam;
