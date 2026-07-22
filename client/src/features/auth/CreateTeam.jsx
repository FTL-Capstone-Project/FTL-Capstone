// ── feature: auth · Create Team (analyst/admin path) · owner: Michael ──
// Two-step flow: create a Clerk account + org (step 1), then invite teammates (step 2).
//
// Domain logic:
//   - Generic provider (gmail, outlook, yahoo…) → manual_invitation only; members must be
//     explicitly invited; anyone can sign up with those addresses independently.
//   - Custom org domain (e.g. acme.com) → automatic_invitation; anyone whose email matches
//     the domain can join automatically once the admin sends them an invite link.
//
// Clerk APIs used:
//   useSignUp  → create the admin's account + verify email
//   useClerk   → clerk.createOrganization({ name })
//   useOrganization → org.createDomain, domain.updateEnrollmentMode, org.inviteMembers
import { useState, useEffect } from "react";
import { useSignUp, useClerk, useOrganization, useAuth } from "@clerk/clerk-react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AuthCard, Field, PrimaryButton, PrivacyNote } from "./AuthKit.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

// Free/consumer email domains that don't represent a specific organization.
// Domains in this list are never added as org domains (would let anyone auto-join).
const FREE_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk",
  "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com",
  "aol.com", "zoho.com",
]);

const isOrgDomain = (domain) => domain && !FREE_DOMAINS.has(domain.toLowerCase());
const getDomain = (email) => email.includes("@") ? email.split("@")[1].toLowerCase() : "";

const MIN_PASSWORD = 15;

const errMsg = (err, fallback) => err?.errors?.[0]?.message || fallback;

const ErrorText = ({ children }) => (
  <p style={{ color: "var(--danger)", fontSize: "0.85em", margin: "0 0 12px", textAlign: "center" }}>
    {children}
  </p>
);

// ── Step 1: create account + org ────────────────────────────────────────────
const Step1 = ({ onDone, onPersonal }) => {
  const { signUp, isLoaded: signUpLoaded, setActive } = useSignUp();
  const { createOrganization } = useClerk();
  const { isSignedIn } = useAuth();

  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [autoAdd, setAutoAdd] = useState(true);
  const [verifyStep, setVerifyStep] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const domain = getDomain(email);
  const orgDomain = isOrgDomain(domain);
  const passwordOk = password.length >= MIN_PASSWORD;

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!signUpLoaded || !company.trim() || !email.trim() || !passwordOk) return;
    setError("");
    setBusy(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifyStep(true);
    } catch (err) {
      setError(errMsg(err, "Couldn't create your account. Check the details and try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!signUpLoaded) return;
    setError("");
    setBusy(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status !== "complete") {
        setError("That code didn't work. Try again.");
        setBusy(false);
        return;
      }

      // Create the Clerk organization BEFORE activating (createOrganization needs a session).
      // Then activate both session + org so useOrganization() in Step2 has context.
      await setActive({ session: result.createdSessionId });
      const org = await createOrganization({ name: company.trim() });
      // Set the new org as active so useOrganization() resolves it in Step 2.
      await setActive({ session: result.createdSessionId, organization: org.id });

      // If the email has a custom org domain AND the toggle is on, add it so people with
      // that domain can join automatically (automatic_invitation). Generic providers
      // (gmail, outlook…) are skipped — members must be manually invited.
      if (orgDomain && autoAdd) {
        try {
          const orgDomainRes = await org.createDomain(domain);
          await orgDomainRes.updateEnrollmentMode({ enrollmentMode: "automatic_invitation" });
        } catch {
          // Domain setup failure is non-fatal — the org still exists; admin can add
          // the domain later. Don't block the flow.
        }
      }

      onDone({ org, canAutoAdd: orgDomain && autoAdd, domain });
    } catch (err) {
      setError(errMsg(err, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (verifyStep) {
    return (
      <AuthCard tagline="Check your work email for a verification code.">
        <form onSubmit={handleVerify}>
          <Field label="Verification code" value={code} onChange={setCode} placeholder="123456" />
          {error && <ErrorText>{error}</ErrorText>}
          <PrimaryButton disabled={busy}>{busy ? "Setting up your team…" : "Verify & create team"}</PrimaryButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      footer={
        <p style={{ textAlign: "center", fontSize: "0.9em", color: "var(--text-dim)" }}>
          Just want it for yourself?{" "}
          <button onClick={onPersonal}
            style={{ border: "none", background: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", fontSize: "1em", padding: 0 }}>
            Create a personal account →
          </button>
        </p>
      }
    >
      <ProgressBar current={1} />
      <h2 style={{ textAlign: "center", color: "var(--navy)", margin: "0 0 6px" }}>Set up Orbis for your team</h2>
      <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9em", margin: "0 0 20px" }}>
        Protect your whole organization from scams — you'll be the admin.
      </p>

      <form onSubmit={handleCreate}>
        <Field label="Company or team name" value={company} onChange={setCompany} placeholder="Acme Inc." />
        <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@company.com"
          hint="Use your company email so teammates can find your workspace." />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••••••"
          hint="At least 15 characters" hintOk={passwordOk} autoComplete="new-password" />

        {/* Auto-add domain toggle — only meaningful for custom org domains */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 18px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: "0.9em" }}>
              Auto-add anyone with your company email
            </div>
            <div style={{ fontSize: "0.8em", color: "var(--text-dim)" }}>
              {orgDomain
                ? "Teammates who sign up with your domain join automatically — no invites needed."
                : "Not available for shared providers (Gmail, Outlook, etc.) — invite teammates manually."}
            </div>
          </div>
          {orgDomain && domain && (
            <span style={{ fontSize: "0.75em", color: "var(--safe)", background: "var(--safe-bg)",
              padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
              ● {domain}
            </span>
          )}
          <Toggle on={orgDomain ? autoAdd : false} onClick={() => orgDomain && setAutoAdd((v) => !v)}
            disabled={!orgDomain} />
        </div>

        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton disabled={busy || !signUpLoaded || !passwordOk || !company.trim()}>
          {busy ? "Creating…" : "Continue →"}
        </PrimaryButton>
      </form>
      <PrivacyNote />
    </AuthCard>
  );
};

// ── Step 2: invite teammates ─────────────────────────────────────────────────
const Step2 = ({ canAutoAdd, domain, onDone }) => {
  const { organization } = useOrganization();
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const sendInvites = async (event) => {
    event.preventDefault();
    if (!organization) return;
    const list = emails.split(",").map((e) => e.trim()).filter(Boolean);
    if (!list.length) { onDone(); return; }

    setBusy(true);
    setError("");
    try {
      await organization.inviteMembers({ emailAddresses: list, role: "org:member" });
      setDone(true);
      setTimeout(onDone, 1200); // brief "sent!" pause before routing
    } catch (err) {
      setError(errMsg(err, "Couldn't send some invites. Check the email addresses and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <ProgressBar current={2} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <OrboAvatar pose="safe" size={72} />
      </div>
      <h2 style={{ textAlign: "center", color: "var(--navy)", margin: "0 0 6px" }}>Invite your team</h2>
      <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9em", margin: "0 0 4px" }}>
        {canAutoAdd
          ? `Anyone with a @${domain} email can join automatically. Invite others below.`
          : "Add teammates by email — they'll get an invite link to join your workspace."}
      </p>
      <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.85em", margin: "0 0 20px" }}>
        You can always do this later from Settings.
      </p>

      <form onSubmit={sendInvites}>
        <label style={{ display: "block", fontWeight: 700, color: "var(--navy)", fontSize: "0.9em", marginBottom: 6 }}>
          Teammate emails
        </label>
        <textarea
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          placeholder="jane@company.com, sam@company.com…"
          rows={4}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
            border: "1px solid var(--border)", fontSize: "0.95em", color: "var(--text)",
            resize: "vertical", fontFamily: "inherit", background: "var(--surface)" }}
        />
        <p style={{ margin: "6px 0 18px", fontSize: "0.8em", color: "var(--text-dim)" }}>
          Separate emails with commas.
        </p>

        {error && <ErrorText>{error}</ErrorText>}
        {done && (
          <p style={{ textAlign: "center", color: "var(--safe)", fontWeight: 700, marginBottom: 12 }}>
            Invites sent!
          </p>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send invites"}
          </PrimaryButton>
          <button type="button" onClick={onDone}
            style={{ flexShrink: 0, padding: "13px 20px", borderRadius: 12,
              border: "1px solid var(--border)", background: "var(--surface)", color: "var(--navy)",
              fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: 6 }}>
            Skip for now <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </AuthCard>
  );
};

// ── Root component ───────────────────────────────────────────────────────────
const CreateTeam = () => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const [step, setStep] = useState(1);
  const [orgMeta, setOrgMeta] = useState(null); // { canAutoAdd, domain }

  // After the whole flow, land on the analyst's home (ask-orbo).
  const finish = () => navigate("/ask-orbo");

  // Already signed in (e.g. refreshed mid-flow) — skip straight to invite step.
  useEffect(() => {
    if (isSignedIn && step === 1) setStep(2);
  }, [isSignedIn, step]);

  return step === 1 ? (
    <Step1
      onDone={({ canAutoAdd, domain }) => { setOrgMeta({ canAutoAdd, domain }); setStep(2); }}
      onPersonal={() => navigate("/create-account?type=personal")}
    />
  ) : (
    <Step2
      canAutoAdd={orgMeta?.canAutoAdd ?? false}
      domain={orgMeta?.domain ?? ""}
      onDone={finish}
    />
  );
};

// ── Shared sub-components ────────────────────────────────────────────────────

const ProgressBar = ({ current }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, margin: "6px 0 18px" }}>
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ width: 90, height: 5, borderRadius: 999, background: "var(--primary)" }} />
      <span style={{ width: 90, height: 5, borderRadius: 999, background: current >= 2 ? "var(--primary)" : "var(--border)" }} />
    </div>
    <span style={{ fontSize: "0.8em", color: "var(--text-dim)" }}>Step {current} of 2</span>
  </div>
);

const Toggle = ({ on, onClick, disabled }) => (
  <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled}
    style={{ width: 44, height: 26, borderRadius: 999, border: "none",
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
      background: on ? "var(--primary)" : "var(--border)", position: "relative",
      flexShrink: 0, transition: "background 0.15s" }}>
    <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20,
      borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
  </button>
);

export default CreateTeam;
