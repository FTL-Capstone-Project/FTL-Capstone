import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Sun, Moon, Monitor, Check, Puzzle, Copy, RefreshCw } from "lucide-react";
import { getThemePreference, setThemePreference } from "../../lib/theme.js";
import { api } from "../../lib/api.js";

// ── feature: settings · owner: David ──
// Account & preferences. First control: Appearance (Light / Dark / System), like Gemini.
// "System" follows the OS theme live; Light/Dark pin an explicit choice. The store lives in
// lib/theme.js; the top-bar sun/moon toggle stays in sync because both read the same source.

const OPTIONS = [
  { value: "light", label: "Light", sub: "Always light", icon: Sun },
  { value: "dark", label: "Dark", sub: "Always dark", icon: Moon },
  { value: "system", label: "System", sub: "Match your device", icon: Monitor },
];

const Settings = () => {
  const { getToken } = useAuth();
  const [pref, setPref] = useState(getThemePreference);

  const choose = (value) => setPref(setThemePreference(value));

  // ── Browser-extension API key ──
  // The key is shown ONCE (the server never returns it again). We only track whether one exists.
  const [hasKey, setHasKey] = useState(null);   // null = loading, true/false = known
  const [newKey, setNewKey] = useState("");      // the just-generated raw key (shown once)
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get("/api/users/api-key", { getToken })
      .then((r) => setHasKey(Boolean(r.hasKey)))
      .catch(() => setHasKey(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generateKey = async () => {
    setBusy(true);
    try {
      const { apiKey } = await api.post("/api/users/api-key", {}, { getToken });
      setNewKey(apiKey);
      setHasKey(true);
      setCopied(false);
    } catch {
      // leave state as-is; the button can be retried
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    try { await navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked — the key is still visible to select manually */ }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--navy)", marginBottom: 4 }}>Settings</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: 28 }}>Manage how Orbis looks and behaves.</p>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: 24, boxShadow: "var(--shadow)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>Appearance</h2>
        <p style={{ color: "var(--text-dim)", fontSize: "0.9em", marginBottom: 18 }}>
          Choose a theme. "System" follows your device's light or dark setting automatically.
        </p>

        <div className="settings-theme-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {OPTIONS.map(({ value, label, sub, icon: Icon }) => {
            const active = pref === value;
            return (
              <button key={value} type="button" onClick={() => choose(value)}
                aria-pressed={active}
                style={{
                  position: "relative", textAlign: "left", cursor: "pointer",
                  border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
                  background: active ? "rgba(15,98,254,0.06)" : "var(--surface)",
                  borderRadius: 12, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 6,
                }}>
                {active && (
                  <span style={{ position: "absolute", top: 10, right: 10, color: "var(--primary)" }}>
                    <Check size={16} />
                  </span>
                )}
                <Icon size={22} color={active ? "var(--primary)" : "var(--text-dim)"} />
                <span style={{ fontWeight: 700, color: "var(--navy)" }}>{label}</span>
                <span style={{ fontSize: "0.82em", color: "var(--text-dim)" }}>{sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: 24, boxShadow: "var(--shadow)", marginTop: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginBottom: 4,
          display: "flex", alignItems: "center", gap: 8 }}>
          <Puzzle size={18} /> Browser extension
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: "0.9em", marginBottom: 18 }}>
          Generate a key to sign the Orbis browser extension in to your account. Paste it into the
          extension's Settings. Treat it like a password — anyone with it can check links as you.
        </p>

        {newKey ? (
          <div>
            <p style={{ fontSize: "0.85em", color: "var(--navy)", fontWeight: 700, marginBottom: 8 }}>
              Copy this key now — you won't be able to see it again.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ flex: 1, wordBreak: "break-all", background: "var(--canvas)",
                border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", fontSize: "0.82em" }}>
                {newKey}
              </code>
              <button type="button" onClick={copyKey} style={btnStyle(true)}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={generateKey} disabled={busy} style={btnStyle(true, busy)}>
              <RefreshCw size={15} /> {busy ? "Generating…" : hasKey ? "Regenerate key" : "Generate key"}
            </button>
            <span style={{ fontSize: "0.85em", color: "var(--text-dim)" }}>
              {hasKey == null ? "" : hasKey
                ? "A key is active. Regenerating replaces it — the old key stops working immediately."
                : "No key yet."}
            </span>
          </div>
        )}
      </section>
    </div>
  );
};

const btnStyle = (filled, disabled = false) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "9px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.88em",
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
  border: "1.5px solid var(--primary)",
  background: filled ? "var(--primary)" : "transparent",
  color: filled ? "#fff" : "var(--primary)",
});

export default Settings;
