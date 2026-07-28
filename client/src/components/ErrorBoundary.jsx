// ── shared: app-wide error boundary · owner: David ──
// EXCEPTION to the team arrow-function-only rule: React only supports error boundaries via a CLASS
// component (componentDidCatch / getDerivedStateFromError have no hook equivalent). This is the one
// place a class is required, so it stays a class on purpose.
//
// Why it exists: without a boundary, a single render-time throw ANYWHERE (a malformed API row, an
// unexpected null in a chart's data array, a lib edge case) unmounts the whole React tree and the
// user gets a permanent blank screen with no way out but a manual reload. This catches that and shows
// a calm, on-brand "something went wrong — reload" instead, turning a catastrophe into a recoverable moment.
import React from "react";
import OrbisLogo from "./OrbisLogo.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  // Flip to the fallback on the next render when a child throws.
  static getDerivedStateFromError() {
    return { hasError: true };
  }

  // Log for our own debugging; we deliberately don't show the raw error to the user (it can leak
  // internals and means nothing to them). A real error-reporting hook (Sentry, etc.) would go here.
  componentDidCatch(error, info) {
    console.error("[orbis] uncaught render error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 18, padding: 24,
          background: "var(--canvas)", color: "var(--text)", textAlign: "center",
        }}
      >
        <OrbisLogo height={40} />
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: "1.25rem", color: "var(--navy)" }}>
            Something went wrong
          </h1>
          <p style={{ margin: 0, color: "var(--text-dim)", maxWidth: 420, lineHeight: 1.5 }}>
            Orbo hit an unexpected snag rendering this page. Reloading usually clears it — your data is safe.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 22px", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
