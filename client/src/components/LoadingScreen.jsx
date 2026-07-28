// ── shared: full-screen branded loading state · owner: David ──
// Shown while something app-level is still resolving (e.g. Clerk bootstrapping the session on a hard
// refresh). Replaces a bare `return null`, which rendered a blank white screen for the ~0.5-2s of
// Clerk's boot — the single most demo-visible "blank area" since refreshing a protected page hits it
// every time. A centered logo + gentle spinner reads as intentional instead of broken.
import OrbisLogo from "./OrbisLogo.jsx";

const LoadingScreen = ({ label = "Loading…" }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 20,
        background: "var(--canvas)",
      }}
    >
      <OrbisLogo height={40} />
      {/* Reuses the repo's .landing-spin class (theme/global.css) — a spinner is the deliberate
          exception to the reduced-motion rule there (a frozen spinner reads as a hang), so this is
          consistent with how the rest of the app spins. */}
      <div
        aria-hidden="true"
        className="landing-spin"
        style={{
          width: 28, height: 28, borderRadius: "50%",
          border: "3px solid var(--border)", borderTopColor: "var(--primary)",
        }}
      />
      <span style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>{label}</span>
    </div>
  );
};

export default LoadingScreen;
