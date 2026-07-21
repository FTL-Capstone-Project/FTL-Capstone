import { Link } from "react-router-dom";
import { Puzzle, ArrowLeft, KeyRound, MousePointerClick } from "lucide-react";
import OrbisLogo from "../../components/OrbisLogo.jsx";

// ── feature: extension install · owner: David ──
// Public page at /extension. The landing page's "Download Extension" buttons point here.
// Honest about the real state: the extension isn't on the Chrome Web Store yet (that's a
// submission + review step), so today it installs via Chrome's "Load unpacked" developer flow.
// When the store listing ships, swap STORE_URL in and this page flips to a one-click "Add to
// Chrome". No emojis (lucide only), theme tokens only — matches the landing page conventions.

const STORE_URL = null; // set to the Chrome Web Store URL once the listing is live

const card = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
  padding: 24, boxShadow: "var(--shadow)",
};
const step = {
  display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0",
  borderBottom: "1px solid var(--border)",
};
const num = {
  flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "var(--primary)",
  color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
};
const code = {
  background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "2px 7px", fontSize: "0.88em", fontFamily: "ui-monospace, Menlo, monospace",
};

const Step = ({ n, children }) => (
  <div style={step}><span style={num}>{n}</span><div style={{ lineHeight: 1.6 }}>{children}</div></div>
);

const ExtensionInstall = () => {
  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <nav style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <OrbisLogo height={30} />
          <Link to="/" style={{ color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <ArrowLeft size={16} /> Back
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: "var(--navy)", display: "flex", alignItems: "center", gap: 10 }}>
          <Puzzle size={28} /> Orbis for Chrome
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 17, marginTop: 6, marginBottom: 28, lineHeight: 1.6 }}>
          Check links right where you read them. In Gmail, Orbo gives an instant safety read on a
          link before you open it — and you can right-click any link on any page to check it.
        </p>

        {STORE_URL ? (
          <a href={STORE_URL} style={{ display: "inline-block", background: "var(--primary)", color: "#fff",
            fontWeight: 700, padding: "12px 22px", borderRadius: 10, textDecoration: "none" }}>
            Add to Chrome
          </a>
        ) : (
          <div style={{ ...card, borderColor: "var(--primary)", background: "rgba(15,98,254,0.05)", marginBottom: 24 }}>
            <p style={{ margin: 0, color: "var(--navy)", fontWeight: 700 }}>Coming soon to the Chrome Web Store.</p>
            <p style={{ margin: "6px 0 0", color: "var(--text-dim)", lineHeight: 1.6 }}>
              We're finishing the store listing. In the meantime you can install the developer build
              in about a minute — follow the steps below.
            </p>
          </div>
        )}

        <section style={{ ...card, marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", display: "flex", alignItems: "center", gap: 8, marginTop: 0 }}>
            <MousePointerClick size={18} /> Install the developer build
          </h2>
          <Step n={1}>Get the <span style={code}>extension/</span> folder from the Orbis repo (or your team's shared build).</Step>
          <Step n={2}>Open Chrome and go to <span style={code}>chrome://extensions</span>.</Step>
          <Step n={3}>Turn on <b>Developer mode</b> (toggle, top-right).</Step>
          <Step n={4}>Click <b>Load unpacked</b> and select the <span style={code}>extension/</span> folder. Orbo appears in your toolbar.</Step>
          <div style={{ ...step, borderBottom: "none" }}>
            <span style={num}>5</span>
            <div style={{ lineHeight: 1.6 }}>Open Gmail and click a link inside an email — Orbo shows a safety read before it opens.</div>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", display: "flex", alignItems: "center", gap: 8, marginTop: 0 }}>
            <KeyRound size={18} /> Connect it to your account
          </h2>
          <p style={{ color: "var(--text-dim)", lineHeight: 1.6, marginTop: 0 }}>
            So the extension checks links as you, generate a key in{" "}
            <Link to="/settings" style={{ color: "var(--primary)", fontWeight: 700 }}>Settings → Browser extension</Link>,
            then paste it into the extension's own Settings. Treat the key like a password — you can
            regenerate it anytime to instantly revoke the old one.
          </p>
        </section>
      </main>
    </div>
  );
};

export default ExtensionInstall;
