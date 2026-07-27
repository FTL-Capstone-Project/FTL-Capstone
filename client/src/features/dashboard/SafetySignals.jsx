// ── feature: dashboard · SafetySignals · owner: Michael ──
// "Red Flags & Channels" — a compact strip of the deterministic signals Orbis caught
// across the user's checks, plus where their threats arrive (web vs forwarded email).
//
// The red-flag counts (known-bad, redirect, brand-new domain) come from urlscan /
// Safe Browsing, which are OPTIONAL external services — they stub to 0 when their API
// key isn't set. So we render ONLY the flags with a non-zero count: on a keyless deploy
// this simply shows fewer flags instead of a misleading row of zeros. If none fired at
// all, we fall back to a reassuring "no red flags" line.
import { ShieldAlert, CornerUpRight, Sparkles, Globe, Mail } from "lucide-react";

// Default the props so a missing block (older payload, mid-fetch) renders an empty
// state instead of throwing — the server always sends these, but be defensive.
const SafetySignals = ({ redFlags = {}, channels = {} }) => {
  // Build the flag list, dropping any that are zero (see header note on why).
  const flags = [
    { key: "knownBad", count: redFlags.knownBad ?? 0, Icon: ShieldAlert, label: "Known-malicious links", color: "var(--danger)" },
    { key: "redirect", count: redFlags.redirect ?? 0, Icon: CornerUpRight, label: "Sneaky redirects", color: "var(--review)" },
    { key: "newDomain", count: redFlags.newDomain ?? 0, Icon: Sparkles, label: "Brand-new domains", color: "var(--review)" },
  ].filter((f) => f.count > 0);

  const web = channels.web ?? 0;
  const email = channels.email ?? 0;
  const totalChannel = web + email;

  return (
    <Card>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 2px" }}>Red Flags & Channels</h2>
        <p style={{ color: "var(--text-dim)", fontSize: "0.78em", margin: 0 }}>What Orbis caught, and where it reached you</p>
      </div>

      {/* Red-flag rows (or a reassuring fallback when none fired). */}
      {flags.length === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "0 0 16px" }}>
          No red flags caught yet — nothing you checked was a known-bad link, a sneaky
          redirect, or a brand-new domain.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {flags.map(({ key, count, Icon, label, color }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 30, height: 30, flexShrink: 0, borderRadius: 8,
                  background: "var(--canvas)", display: "grid", placeItems: "center", color,
                }}
              >
                <Icon size={16} />
              </span>
              <span style={{ color: "var(--text)", fontSize: "0.9em" }}>{label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--navy)" }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Channel split: how the links you checked reached you. */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78em", color: "var(--text-dim)", marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Globe size={13} /> Web checks</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>Forwarded emails <Mail size={13} /></span>
        </div>
        {totalChannel === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.8em", margin: 0 }}>No checks yet.</p>
        ) : (
          <>
            {/* Single proportional bar: blue = web, cyan = email. */}
            <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--border)" }}>
              <div style={{ width: `${(web / totalChannel) * 100}%`, background: "var(--primary)" }} />
              <div style={{ width: `${(email / totalChannel) * 100}%`, background: "var(--ring)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: "0.82em", fontWeight: 700, color: "var(--navy)" }}>
              <span>{web}</span>
              <span>{email}</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

const Card = ({ children }) => (
  <div
    style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      boxShadow: "var(--shadow)",
      padding: 20,
    }}
  >
    {children}
  </div>
);

export default SafetySignals;
