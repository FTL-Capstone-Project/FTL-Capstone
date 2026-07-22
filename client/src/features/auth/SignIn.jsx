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
import { useState, useEffect } from "react";
import { useSignIn, useSignUp, useAuth } from "@clerk/clerk-react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
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
  const { signUp, isLoaded: signUpLoaded, setActive: signUpSetActive } = useSignUp();
  const { isSignedIn } = useAuth();
  const [params] = useSearchParams();
  const type = params.get("type") || "personal";
  const footer = FOOTER[type] ?? FOOTER.personal;

  // Org invite ticket: Clerk appends __clerk_ticket=... to the redirect URL when
  // someone clicks an org invite link. We detect it and process it automatically —
  // no password needed for existing users; new users get a password-set step.
  const inviteTicket = params.get("__clerk_ticket") ?? null;
  const [ticketStep, setTicketStep] = useState(inviteTicket ? "processing" : null);
  // "processing" → auto-signing in | "set-password" → new user needs a password | null → normal form

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");  // for invite new-user set-password step
  const [code, setCode] = useState("");
  const [step, setStep] = useState("credentials"); // "credentials" | "verify"
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Once Clerk confirms the session, redirect off real state (not imperative navigate).
  if (isSignedIn) return <Navigate to={AFTER_AUTH} replace />;

  // ── Invite-ticket auto-processing ──────────────────────────────────────────
  // Runs once when the component mounts with a ticket in the URL.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!inviteTicket || !isLoaded || !signUpLoaded) return;
    let alive = true;

    (async () => {
      try {
        // Try sign-in first (existing account accepts the invite immediately).
        const res = await signIn.create({ strategy: "ticket", ticket: inviteTicket });
        if (!alive) return;
        if (res.status === "complete") {
          await setActive({ session: res.createdSessionId });
          // isSignedIn will flip → the <Navigate> at the top routes us in.
        } else {
          setTicketStep(null); // unexpected status — fall through to normal form
        }
      } catch (signInErr) {
        if (!alive) return;
        // Sign-in failed (user doesn't have an account yet) → try sign-up with ticket.
        // The ticket pre-fills their email; they just need to set a password.
        try {
          const res = await signUp.create({ strategy: "ticket", ticket: inviteTicket });
          if (!alive) return;
          if (res.status === "complete") {
            await signUpSetActive({ session: res.createdSessionId });
          } else if (res.status === "missing_requirements") {
            // New user needs to set a password before the account completes.
            setTicketStep("set-password");
          } else {
            setTicketStep(null);
          }
        } catch {
          if (alive) setTicketStep(null); // both paths failed → show normal form
        }
      }
    })();

    return () => { alive = false; };
  }, [inviteTicket, isLoaded, signUpLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
        await setActive({ session: res.createdSessionId }); // isSignedIn flips → top <Navigate> takes over
        return;
      }
      // Not complete → Clerk wants an email code. Prepare it with the REQUIRED
      // emailAddressId, read off the matching supported factor (sending only
      // { strategy } is rejected by Clerk). Covers "needs_first_factor" and any
      // other not-complete status that offers an email_code factor.
      const emailFactor = signIn.supportedFirstFactors?.find((f) => f.strategy === "email_code");
      if (emailFactor?.emailAddressId) {
        await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: emailFactor.emailAddressId });
        setStep("verify");
      } else {
        setError("This account needs a different sign-in method. Try 'Continue with Google', or reset your password.");
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
        await setActive({ session: res.createdSessionId }); // top <Navigate> takes over
      } else {
        setError("That code didn't work. Try again.");
      }
    } catch (err) {
      setError(errMsg(err, "Verification failed."));
    } finally {
      setBusy(false);
    }
  };

  // ── Invite ticket UI states ────────────────────────────────────────────────

  // "processing" — auto sign-in in flight; show a placeholder so the screen isn't blank.
  if (ticketStep === "processing") {
    return (
      <AuthCard tagline="Accepting your invitation…">
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9em" }}>
          One moment while we set up your account.
        </p>
      </AuthCard>
    );
  }

  // "set-password" — new user accepted via ticket but Clerk needs them to set a password.
  if (ticketStep === "set-password") {
    const handleSetPassword = async (event) => {
      event.preventDefault();
      if (!signUpLoaded || newPassword.length < 8) return;
      setBusy(true);
      setError("");
      try {
        const res = await signUp.update({ password: newPassword });
        if (res.status === "complete") {
          await signUpSetActive({ session: res.createdSessionId });
        } else {
          setError("Couldn't complete sign-up. Please try again.");
        }
      } catch (err) {
        setError(errMsg(err, "Couldn't set password. Please try again."));
      } finally {
        setBusy(false);
      }
    };

    return (
      <AuthCard tagline="You've been invited to join the team!">
        <p style={{ color: "var(--text-dim)", fontSize: "0.9em", marginBottom: 20, textAlign: "center" }}>
          Create a password to complete your account.
        </p>
        <form onSubmit={handleSetPassword}>
          <Field
            label="Password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="••••••••"
            hint="At least 8 characters"
            hintOk={newPassword.length >= 8}
            autoComplete="new-password"
          />
          {error && <ErrorText>{error}</ErrorText>}
          <PrimaryButton disabled={busy || newPassword.length < 8}>
            {busy ? "Creating account…" : "Join the team →"}
          </PrimaryButton>
        </form>
      </AuthCard>
    );
  }

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
