// ── feature: dashboard · ActivityRail · owner: Michael ──
// The right column of the dashboard (shown for org members + analysts, NOT individuals):
//   • My Activity — a feed of recent events (submissions + notifications), each
//     an avatar dot + label + subject + relative time ("2m ago").
//   • Ask Orbo — a working data-query chat. You type a plain-English question about your
//     team's threat data and Orbo answers with real numbers, powered by POST /api/nlp-query
//     (the whitelisted, validated, parameterized, ROLE-SCOPED query engine — a member only
//     ever sees their own + analyst-shared data, an analyst sees the whole org). It is NOT a
//     link checker and NOT a free-form chatbot — it answers questions about the data we hold.
// The feed data is derived server-side (dashboard.service.js) from real rows.
import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../lib/useApi.js";
import orboWave from "../../assets/orbo/orbo-wave.png";

// How many activity rows to show before the "See more" toggle. The feed can get long, so we
// keep it to a tidy few and let the user expand to the full list on demand.
const ACTIVITY_PREVIEW = 3;

// `title` relabels the feed (personal/member "My Activity", analyst "Team Activity"). `role`
// tells the chat whether to offer the analyst-only "Open in Insights" link for big reports.
const ActivityRail = ({ activity = [], title = "My Activity", role = "member" }) => {
  // Collapsed by default → show only the first few; "See more" reveals the rest.
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? activity : activity.slice(0, ACTIVITY_PREVIEW);
  const hiddenCount = activity.length - ACTIVITY_PREVIEW;

  return (
    <aside style={{ display: "grid", gap: 20, alignContent: "start" }}>
      {/* Activity feed */}
      <div>
        <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 14px" }}>{title}</h2>
        {activity.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>No activity yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {shown.map((a, i) => (
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
            {/* Toggle: only when there's more than the preview count. Collapses back with "Show less". */}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{
                  justifySelf: "start", background: "none", border: "none", padding: "2px 0",
                  color: "var(--primary)", fontWeight: 600, fontSize: "0.82em", cursor: "pointer",
                }}
              >
                {expanded ? "Show less" : `See more (${hiddenCount})`}
              </button>
            )}
          </div>
        )}
      </div>

      <AskOrboChat role={role} />
    </aside>
  );
}

// The Ask Orbo chat panel on the right rail — a WORKING data-query chat. You type a plain-English
// question ("how many dangerous links this week?", "break down checks by verdict") and Orbo answers
// with real numbers from POST /api/nlp-query. The heavy named reports (heatmap, 90-day trend, etc.)
// are too big for a 300px rail, so those answer with a one-line summary and (for analysts) a link
// into the full Insights page. This is a DATA assistant, not a link checker or open chatbot.
const GREETING = { from: "orbo", kind: "text", text: "Hi! Ask me about your team's threat data — e.g. \"how many dangerous links this week?\" or \"break down checks by verdict\"." };

const AskOrboChat = ({ role = "member" }) => {
  const api = useApi();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const scrollRef = useRef(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const ask = async (e) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { from: "user", kind: "text", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const res = await api.post("/api/nlp-query", { question });
      setMessages((m) => [...m, toOrboMessage(res)]);
    } catch (err) {
      // 403 (individual/no-org), 503 (not configured), 502 (query failed) → a plain, honest line.
      const text =
        err?.status === 503
          ? "Data queries aren't configured on this deployment yet."
          : err?.status === 429
            ? "You're asking a lot at once — give it a moment and try again."
            : "I couldn't run that just now. Try rephrasing, or ask something like \"how many dangerous links this week?\"";
      setMessages((m) => [...m, { from: "orbo", kind: "text", text }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        display: "flex",
        flexDirection: "column",
        height: 360,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <img src={orboWave} alt="" width={26} height={26} style={{ objectFit: "contain" }} />
        <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: "0.9em" }}>Ask Orbo</span>
      </div>

      {/* Message area — scrolls on its own. */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <Bubble key={i} message={m} role={role} />
        ))}
        {busy && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <img src={orboWave} alt="" width={24} height={24} style={{ objectFit: "contain", flexShrink: 0 }} />
            <div style={{ background: "var(--canvas)", borderRadius: "4px 12px 12px 12px", padding: "10px 12px", fontSize: "0.84em", color: "var(--text-dim)" }}>
              Looking that up…
            </div>
          </div>
        )}
      </div>

      {/* Input pinned to the bottom. */}
      <form onSubmit={ask} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={busy}
          aria-label="Ask a question about your data"
          placeholder="Ask about your data…"
          style={{
            flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 999,
            padding: "8px 14px", fontSize: "0.85em", background: "var(--canvas)", color: "var(--text)",
          }}
        />
        <button
          type="submit"
          aria-label="Ask Orbo"
          disabled={busy}
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: "50%", border: "none",
            background: "var(--primary)", color: "#fff", cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1, fontSize: "1em",
          }}
        >
          →
        </button>
      </form>
    </div>
  );
}

// One chat bubble. User bubbles are plain text on the right; Orbo bubbles render the
// structured answer (a number, a number + evidence links, or a report summary) on the left.
const Bubble = ({ message, role }) => {
  if (message.from === "user") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "85%", minWidth: 0, background: "var(--primary)", color: "#fff",
        borderRadius: "12px 12px 4px 12px", padding: "8px 12px", fontSize: "0.84em", lineHeight: 1.4,
        overflowWrap: "anywhere" }}>
        {message.text}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <img src={orboWave} alt="" width={24} height={24} style={{ objectFit: "contain", flexShrink: 0 }} />
      {/* minWidth:0 lets this bubble shrink inside the flex row instead of forcing the row wider;
          overflowWrap breaks a long unbroken token (URL/domain) rather than overflowing sideways. */}
      <div style={{ maxWidth: "85%", minWidth: 0, background: "var(--canvas)", borderRadius: "4px 12px 12px 12px",
        padding: "10px 12px", fontSize: "0.84em", color: "var(--text)", lineHeight: 1.45, overflowWrap: "anywhere" }}>
        <OrboAnswer message={message} role={role} />
      </div>
    </div>
  );
};

// Verdict → the theme colour used for a card's score chip.
const VERDICT_COLOR = { safe: "var(--safe)", dangerous: "var(--danger)", suspicious: "var(--review)" };

// "Jul 26, 2026" from an ISO timestamp (or "" if absent/unparseable).
const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

// Render Orbo's answer: the LLM-written prose, plus embedded report cards when the answer is a
// list of reports. The prose is the server's `answer`; cards are exact DB values (not LLM text).
const OrboAnswer = ({ message }) => {
  const cards = Array.isArray(message.cards) ? message.cards : [];
  return (
    // minWidth:0 on the grid + its rows so neither the prose nor a card can widen the bubble.
    <div style={{ display: "grid", gap: cards.length ? 10 : 0, minWidth: 0 }}>
      {message.text && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.text}</span>}
      {cards.length > 0 && (
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          {cards.map((c) => (
            <Link
              key={c.indicatorId}
              to={`/reports?q=${encodeURIComponent(c.domain ?? c.title ?? "")}`}
              style={{
                display: "block", textDecoration: "none", color: "var(--text)",
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "8px 10px",
                // A grid item defaults to min-width:auto, which lets the nowrap title push the card
                // past the bubble. minWidth:0 lets it shrink so the title ellipsis kicks in instead.
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ minWidth: 0, fontWeight: 700, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.title}
                </span>
                {c.score != null && (
                  <span style={{ flexShrink: 0, fontWeight: 800, color: VERDICT_COLOR[c.verdict] ?? "var(--text-dim)" }}>
                    {c.score}/100
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: "0.82em", color: "var(--text-dim)", flexWrap: "wrap", minWidth: 0 }}>
                {c.verdict && <span style={{ color: VERDICT_COLOR[c.verdict] ?? "var(--text-dim)", fontWeight: 600, textTransform: "capitalize" }}>{c.verdict}</span>}
                {c.reviewStatus && <span>· {c.reviewStatus}</span>}
                {c.channel && <span>· {c.channel === "email" ? "Forwarded email" : "Web check"}</span>}
                {shortDate(c.reportedAt) && <span>· {shortDate(c.reportedAt)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// Turn an /api/nlp-query response into a chat message. The interactive engine returns:
//   { answer, cards, data, chartSpec }  — prose + optional embedded report cards (data/chartSpec
//                                          are for the Insights page; the chat uses answer+cards) ·
//   { fallback }                        — LLM unavailable / not answerable from the data
const toOrboMessage = (res) => {
  if (!res || res.fallback) {
    return { from: "orbo", kind: "text", text: res?.fallback ?? "I couldn't find an answer to that." };
  }
  return {
    from: "orbo",
    kind: "answer",
    text: res.answer ?? "Here's what I found.",
    cards: Array.isArray(res.cards) ? res.cards : [],
  };
}

// "2m ago" / "3h ago" / "5d ago" from an ISO timestamp.
const relativeTime = (iso) => {
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

export default ActivityRail;
