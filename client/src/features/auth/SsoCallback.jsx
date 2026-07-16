// ── feature: auth · SSO callback · owner: Michael ──
// Google/Apple OAuth redirects the browser back here. Clerk's
// <AuthenticateWithRedirectCallback> finishes the handshake (creates the session)
// and then sends the user on — success → the app, problems → back to sign-in.
// The user just sees a brief "Signing you in…" while this runs.
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { AuthCard } from "./AuthKit.jsx";

const SsoCallback = () => {
  return (
    <>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/ask-orbo"
        signUpFallbackRedirectUrl="/ask-orbo"
        continueSignUpUrl="/create-account?type=personal"
      />
      <AuthCard tagline="Signing you in…">
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9em" }}>
          One moment while we finish signing you in.
        </p>
      </AuthCard>
    </>
  );
};

export default SsoCallback;
