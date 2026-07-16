// ── feature: auth · shared UI kit · owner: Michael ──
// The building blocks every auth screen reuses so they all match the wireframes
// exactly (client/src/assets/wireframes/Personal/*). Pure presentation — the real
// Clerk auth logic lives in SignIn.jsx / CreateAccount.jsx.
//
// Exports:
//   <AuthCard>        the centered white card on the soft gradient (logo + slot + footer)
//   <SocialButton>    "Continue with Google/Apple" pill (icon + label)
//   <SsoButton>       "Sign in with SSO" pill
//   <Field>           labeled text/email/password input (password gets a show/hide eye)
//   <PrimaryButton>   the big blue submit button
//   <Divider>         the "or" separator line
import { useState } from "react";
import { Eye, EyeOff, Lock, Square } from "lucide-react";
import OrbisLogo from "../../components/OrbisLogo.jsx";

// Soft gradient page background + centered card (matches the wireframes' frame).
export const AuthCard = ({ children, footer, tagline }) => {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "40px 16px",
        background: "linear-gradient(160deg, #EEF2FF 0%, var(--canvas) 55%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          borderRadius: 20,
          boxShadow: "var(--shadow)",
          padding: "36px 32px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: tagline ? 8 : 20 }}>
          <OrbisLogo height={40} />
        </div>
        {tagline && (
          <p style={{ textAlign: "center", color: "var(--text-dim)", margin: "0 0 22px", fontSize: "0.95em" }}>
            {tagline}
          </p>
        )}
        {children}
        {footer && <div style={{ marginTop: 22 }}>{footer}</div>}
      </div>
    </div>
  );
};

// Generic social/OAuth pill button. `icon` is a small JSX node (logo mark).
export const SocialButton = ({ icon, label, onClick, disabled }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        justifyContent: "flex-start",
        padding: "12px 16px",
        marginBottom: 12,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text)",
        fontSize: "0.95em",
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ width: 22, display: "grid", placeItems: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
};

// "Sign in with SSO" — same pill, neutral square icon (per wireframe).
export const SsoButton = ({ onClick, note = "Use your company's single sign-on (for work accounts)." }) => {
  return (
    <div style={{ marginBottom: 4 }}>
      <SocialButton
        icon={<Square size={18} color="var(--text-dim)" />}
        label="Sign in with SSO"
        onClick={onClick}
      />
      <p style={{ margin: "0 0 12px", fontSize: "0.78em", color: "var(--text-dim)" }}>{note}</p>
    </div>
  );
};

// Labeled input. type="password" adds a show/hide eye + optional hint line under it.
export const Field = ({ label, type = "text", value, onChange, placeholder, hint, hintOk, autoComplete }) => {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontWeight: 700, color: "var(--navy)", fontSize: "0.9em", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={inputType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            paddingRight: isPassword ? 44 : 14,
            borderRadius: 12,
            border: "1px solid var(--border)",
            fontSize: "0.95em",
            color: "var(--text)",
            background: "var(--surface)",
            outline: "none",
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "var(--text-dim)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {hint && (
        <p style={{ margin: "6px 0 0", fontSize: "0.8em", color: hintOk ? "var(--safe)" : "var(--text-dim)" }}>
          {hintOk ? "✓ " : ""}
          {hint}
        </p>
      )}
    </div>
  );
};

export const PrimaryButton = ({ children, disabled, type = "submit", onClick }) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "13px",
        borderRadius: 12,
        border: "none",
        background: "var(--primary)",
        color: "#fff",
        fontSize: "1em",
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
};

export const Divider = ({ label = "or" }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
};

// A small "we never share your data" reassurance line (lucide lock, not an emoji).
export const PrivacyNote = () => (
  <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", margin: "16px 0 0", fontSize: "0.78em", color: "var(--text-dim)" }}>
    <Lock size={12} /> Protected by Orbis. We never share your data.
  </p>
);

// Small inline brand marks for the social buttons (no extra icon deps).
export const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path fill="#4285F4" d="M17.6 9.2c0-.6-.05-1.2-.15-1.7H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
    <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
    <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
  </svg>
);

export const AppleMark = () => (
  <svg width="16" height="18" viewBox="0 0 384 512" aria-hidden>
    <path
      fill="#000"
      d="M318.7 268c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 4 184.6 4 273.5q0 39.4 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-92.6zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
    />
  </svg>
);
