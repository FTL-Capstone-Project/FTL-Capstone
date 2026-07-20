import { useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { getThemePreference, setThemePreference } from "../../lib/theme.js";

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
  const [pref, setPref] = useState(getThemePreference);

  const choose = (value) => setPref(setThemePreference(value));

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
    </div>
  );
};

export default Settings;
