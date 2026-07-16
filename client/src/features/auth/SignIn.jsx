// ── feature: auth · custom Sign-In · owner: Michael ──
// Pixel-matches the wireframe (Personal/Orbis SignIn_Page) but the REAL auth is
// Clerk's useSignIn() hook underneath (custom-flow pattern, Core 2 SDK v5).
//
// Flow: Google/Apple/SSO (OAuth redirect) OR email+password. Password sign-in that
// needs an email code drops into a small verification step. On success → setActive
// → into the app.
//
// The ?type= query (personal | organizational | analyst) only changes the FOOTER
// link + tagline — the sign-in itself is identical for everyone (Clerk decides the
// real org/role once they're in).
import { useState } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  AuthCard, SocialButton, SsoButton, Field, PrimaryButton, Divider, PrivacyNote, GoogleMark, AppleMark,
} from "./AuthKit.jsx";

const AFTER_AUTH = "/ask-orbo"; // where a signed-in user lands

// Footer option per account type (per the auth-flow spec).
const FOOTER = {
  personal: { prompt: "New here?", label: "Create an account", to: "/create-account?type=personal" },
  organizational: { prompt: "Need a solo account?", label: "Create a personal account", to: "/create-account?type=personal" },
  analyst: { prompt: "Setting up your company?", label: "Create a team", to: "/create-team" },
};

// Pull a friendly message out of a Clerk error, else a fallback.
const errMsg = (err, fallback) => err?.errors?.[0]?.message || fallback;

const ErrorText = ({ children }) => (
  <p style={{ color: "var(--danger)", fontSize: "0.85em", margin: "0 0 12px", textAlign: "center" }}>{children}</p>
);

const SignIn = () => {
  const { signIn, isLoaded, setActive } = useSignIn();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const type = params.get("type") || "personal";
  const footer = FOOTER[type] ?? FOOTER.personal;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("credentials"); // "credentials" | "verify"
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // OAuth (Google/Apple) → Clerk hosts the redirect; we come back at /sso-callback.
  const oauth = async (strategy) => {
    if (!isLoaded) return;
    setError("");
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: AFTER_AUTH,
      });
    } catch (err) {
      setError(errMsg(err, "Couldn't start sign-in."));
    }
  };

  const handlePassword = async (event) => {
    event.preventDefault();
    if (!isLoaded) return;
    setError("");
    setBusy(true);
    try {
      const res = await signIn.create({ identifier: email, password });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        navigate(AFTER_AUTH);
      } else if (res.status === "needs_first_factor") {
        // Password alone wasn't enough (e.g. email-code required) → verify step.
        await signIn.prepareFirstFactor({ strategy: "email_code" });
        setStep("verify");
      } else {
        setError("Additional verification is required to sign in.");
      }
    } catch (err) {
      setError(errMsg(err, "Sign in failed. Check your email and password."));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!isLoaded) return;
    setError("");
    setBusy(true);
    try {
      const res = await signIn.attemptFirstFactor({ strategy: "email_code", code });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        navigate(AFTER_AUTH);
      } else {
        setError("That code didn't work. Try again.");
      }
    } catch (err) {
      setError(errMsg(err, "Verification failed."));
    } finally {
      setBusy(false);
    }
  };

  // Verification step (only if Clerk asks for an email code).
  if (step === "verify") {
    return (
      <AuthCard tagline="Enter the code we emailed you.">
        <form onSubmit={handleVerify}>
          <Field label="Verification code" value={code} onChange={setCode} placeholder="123456" />
          {error && <ErrorText>{error}</ErrorText>}
          <PrimaryButton disabled={busy}>{busy ? "Verifying…" : "Verify & sign in"}</PrimaryButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      tagline="Your inbox, safely in orbit."
      footer={
        <p style={{ textAlign: "center", fontSize: "0.9em", color: "var(--text-dim)" }}>
          {footer.prompt}{" "}
          <Link to={footer.to} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            {footer.label} →
          </Link>
        </p>
      }
    >
      <SocialButton icon={<GoogleMark />} label="Continue with Google" onClick={() => oauth("oauth_google")} disabled={!isLoaded} />
      <SocialButton icon={<AppleMark />} label="Continue with Apple" onClick={() => oauth("oauth_apple")} disabled={!isLoaded} />
      <SsoButton onClick={() => oauth("saml")} />

      <Divider />

      <form onSubmit={handlePassword}>
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••••••" autoComplete="current-password" />
        <div style={{ textAlign: "right", margin: "-6px 0 14px" }}>
          <Link to="/create-account?type=personal" style={{ fontSize: "0.82em", color: "var(--primary)", textDecoration: "none" }}>
            Forgot password?
          </Link>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton disabled={busy || !isLoaded}>{busy ? "Signing in…" : "Sign in"}</PrimaryButton>
      </form>

      <PrivacyNote />
    </AuthCard>
  );
};

export default SignIn;
