// ── feature: dashboard · ActivityRail · owner: Michael ──
// The right column of the dashboard:
//   • My Activity — a feed of recent events (submissions + notifications), each
//     an avatar dot + label + subject + relative time ("2m ago").
//   • Ask Orbo mini-box — a shortcut that opens a fresh chat with Orbo.
// The feed data is derived server-side (dashboard.service.js) from real rows.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import orboWave from "../../assets/orbo/orbo-wave.png";

export default function ActivityRail({ activity }) {
  return (
    <aside style={{ display: "grid", gap: 20, alignContent: "start" }}>
      {/* My Activity */}
      <div>
        <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 14px" }}>My Activity</h2>
        {activity.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No activity yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {activity.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: a.kind === "notification" ? "var(--ring)" : "var(--primary)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.7em",
                    fontWeight: 700,
                  }}
                >
                  {a.kind === "notification" ? "★" : "✓"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.85em", color: "var(--navy)", fontWeight: 600 }}>{a.label}</div>
                  <div style={{ fontSize: "0.82em", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.subject}
                  </div>
                  <div style={{ fontSize: "0.72em", color: "var(--text-dim)" }}>{relativeTime(a.at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AskOrboMini />
    </aside>
  );
}

// A compact prompt that jumps into a fresh Orbo chat. It doesn't answer inline
// (that's the chat's job) — it routes to /ask-orbo, the canonical chat Home.
function AskOrboMini() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  // Home reads ?new=1 to start a fresh conversation. We can't prefill the question
  // (Home doesn't read a q= param), so we open a new chat for the user to ask there.
  const go = () => navigate("/ask-orbo?new=1");

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <img src={orboWave} alt="" width={28} height={28} style={{ objectFit: "contain" }} />
        <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: "0.9em" }}>Ask Orbo</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a question…"
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: "0.85em",
            background: "var(--canvas)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          aria-label="Ask Orbo"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            background: "var(--primary)",
            color: "#fff",
            cursor: "pointer",
            fontSize: "1em",
          }}
        >
          →
        </button>
      </form>
    </div>
  );
}

// "2m ago" / "3h ago" / "5d ago" from an ISO timestamp.
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
