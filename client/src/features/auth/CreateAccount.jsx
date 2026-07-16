// ── feature: auth · custom Create-Account · owner: Michael ──
// Pixel-matches the wireframe (Personal/Orbis CreateAccount_Page) with REAL Clerk
// auth via useSignUp() (custom flow, Core 2 SDK v5).
//
// Flow: Google/Apple (OAuth redirect) OR email+password. After create, Clerk sends
// an email code → we show the verify step → setActive → into the app.
// "At least 15 characters" hint turns green live (matches the wireframe).
import { useState } from "react";
import { useSignUp } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import {
  AuthCard, SocialButton, Field, PrimaryButton, Divider, PrivacyNote, GoogleMark, AppleMark,
} from "./AuthKit.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

const AFTER_AUTH = "/ask-orbo";
const MIN_PASSWORD = 15; // matches the wireframe's "At least 15 characters" rule

const errMsg = (err, fallback) => err?.errors?.[0]?.message || fallback;

const ErrorText = ({ children }) => (
  <p style={{ color: "var(--danger)", fontSize: "0.85em", margin: "0 0 12px", textAlign: "center" }}>{children}</p>
);

const CreateAccount = () => {
  const { signUp, isLoaded, setActive } = useSignUp();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("register"); // "register" | "verify"
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordOk = password.length >= MIN_PASSWORD;

  const oauth = async (strategy) => {
    if (!isLoaded) return;
    setError("");
    try {
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: AFTER_AUTH,
      });
    } catch (err) {
      setError(errMsg(err, "Couldn't start sign-up."));
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (!isLoaded) return;
    setError("");
    setBusy(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err) {
      setError(errMsg(err, "Couldn't create your account."));
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
      const res = await signUp.attemptEmailAddressVerification({ code });
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

  if (step === "verify") {
    return (
      <AuthCard tagline="Check your email for a verification code.">
        <form onSubmit={handleVerify}>
          <Field label="Verification code" value={code} onChange={setCode} placeholder="123456" />
          {error && <ErrorText>{error}</ErrorText>}
          <PrimaryButton disabled={busy}>{busy ? "Verifying…" : "Verify email"}</PrimaryButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      footer={
        <div style={{ textAlign: "center", fontSize: "0.9em", color: "var(--text-dim)" }}>
          <p style={{ margin: "0 0 6px" }}>
            Already have an account?{" "}
            <Link to="/signin?type=personal" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
              Sign in →
            </Link>
          </p>
          <p style={{ margin: 0 }}>
            <Link to="/create-team" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
              Setting up Orbis for your team? →
            </Link>
          </p>
          <PrivacyNote />
        </div>
      }
    >
      <h2 style={{ textAlign: "center", color: "var(--navy)", margin: "0 0 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        Let's get you set up
        <OrboAvatar pose="wave" size={32} />
      </h2>

      <SocialButton icon={<GoogleMark />} label="Continue with Google" onClick={() => oauth("oauth_google")} disabled={!isLoaded} />
      <SocialButton icon={<AppleMark />} label="Continue with Apple" onClick={() => oauth("oauth_apple")} disabled={!isLoaded} />

      <Divider />

      <form onSubmit={handleRegister}>
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••••••"
          autoComplete="new-password"
          hint="At least 15 characters"
          hintOk={passwordOk}
        />
        {error && <ErrorText>{error}</ErrorText>}
        {/* Clerk needs this container for its bot-protection widget. */}
        <div id="clerk-captcha" />
        <PrimaryButton disabled={busy || !isLoaded || !passwordOk}>
          {busy ? "Creating…" : "Create account"}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default CreateAccount;
