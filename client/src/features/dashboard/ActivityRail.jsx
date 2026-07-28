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

// `title` relabels the feed (personal/member "My Activity", analyst "Team Activity"). `role`
// tells the chat whether to offer the analyst-only "Open in Insights" link for big reports.
const ActivityRail = ({ activity = [], title = "My Activity", role = "member" }) => {
  return (
    <aside style={{ display: "grid", gap: 20, alignContent: "start" }}>
      {/* Activity feed */}
      <div>
        <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 14px" }}>{title}</h2>
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
      <div style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--primary)", color: "#fff",
        borderRadius: "12px 12px 4px 12px", padding: "8px 12px", fontSize: "0.84em", lineHeight: 1.4 }}>
        {message.text}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <img src={orboWave} alt="" width={24} height={24} style={{ objectFit: "contain", flexShrink: 0 }} />
      <div style={{ maxWidth: "85%", background: "var(--canvas)", borderRadius: "4px 12px 12px 12px",
        padding: "10px 12px", fontSize: "0.84em", color: "var(--text)", lineHeight: 1.45 }}>
        <OrboAnswer message={message} role={role} />
      </div>
    </div>
  );
};

// Render Orbo's structured answer by kind. Everything here is data the server already
// scoped to the caller — we only format it.
const OrboAnswer = ({ message, role }) => {
  if (message.kind === "count") {
    return (
      <span>
        <strong style={{ color: "var(--navy)" }}>{message.value}</strong> {message.label}
      </span>
    );
  }

  if (message.kind === "bucketCount") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <span>
          <strong style={{ color: "var(--navy)" }}>{message.total}</strong> {message.title}
          {message.reportTotal > message.total ? ` (${message.reportTotal} reports)` : ""}
        </span>
        {message.links.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            {message.links.map((l) => (
              <Link
                key={l.indicatorId}
                to={`/reports?q=${encodeURIComponent(l.domain ?? l.title ?? "")}`}
                style={{ display: "flex", justifyContent: "space-between", gap: 8, textDecoration: "none",
                  color: "var(--text)", borderTop: "1px solid var(--border)", paddingTop: 6 }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                <span style={{ flexShrink: 0, fontWeight: 700,
                  color: l.band === "safe" ? "var(--safe)" : l.band === "dangerous" ? "var(--danger)" : "var(--review)" }}>
                  {l.score == null ? "—" : `${l.score}/100`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (message.kind === "report") {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <span>{message.summary}</span>
        {/* The full charted report lives on Insights, which is an analyst-only surface. */}
        {role === "analyst" && (
          <Link to="/insights" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            Open in Insights →
          </Link>
        )}
      </div>
    );
  }

  // Plain text (greeting, fallback, or an error line).
  return <span>{message.text}</span>;
}

// Turn an /api/nlp-query response into a chat message. The response is one of:
//   { fallback } · { data:[{value}], chartSpec:{type:"count"} } ·
//   { data:[links], chartSpec:{type:"bucketCount", total, reportTotal} }  ← verdict counts AND
//        review-status (triage queue) counts share this shape, so both render the same way ·
//   { data, chartSpec:{type:"report"|"heatmap"|"trend"|"table"|"histogram", title, empty?} }
const toOrboMessage = (res) => {
  if (!res || res.fallback) {
    return { from: "orbo", kind: "text", text: res?.fallback ?? "I couldn't find an answer to that." };
  }
  const spec = res.chartSpec ?? {};

  if (spec.type === "count") {
    const value = res.data?.[0]?.value ?? 0;
    // chartSpec.title is a noun phrase ("Blacklisted"); render "<n> match Blacklisted"-ish.
    return { from: "orbo", kind: "count", value, label: (spec.title ?? "results").toLowerCase() };
  }

  if (spec.type === "bucketCount") {
    const links = Array.isArray(res.data) ? res.data.slice(0, 5) : [];
    return {
      from: "orbo", kind: "bucketCount",
      title: spec.title ?? "links", total: spec.total ?? links.length,
      reportTotal: spec.reportTotal ?? spec.total ?? links.length, links,
    };
  }

  // Any of the 5 named reports (or an empty one) → a one-line summary + link-out.
  if (["report", "heatmap", "trend", "table", "histogram"].includes(spec.type)) {
    const summary = spec.empty
      ? `No data yet for "${spec.title}".`
      : `Here's your ${spec.title ?? "report"}${spec.subtitle ? ` — ${spec.subtitle}` : ""}.`;
    return { from: "orbo", kind: "report", summary };
  }

  // A generic grouped chart (bar/line/pie) — summarize the top buckets in words.
  if (Array.isArray(res.data) && res.data.length) {
    const top = [...res.data].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 3)
      .map((d) => `${d.label}: ${d.value}`).join(", ");
    return { from: "orbo", kind: "text", text: `${spec.title ?? "Results"} — ${top}.` };
  }

  return { from: "orbo", kind: "text", text: "I looked, but there's no data for that yet." };
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
