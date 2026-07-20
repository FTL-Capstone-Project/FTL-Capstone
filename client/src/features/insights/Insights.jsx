import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Send, BarChart3, Sparkles } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../../lib/api.js";

// ── feature: insights · owner: David ──
// AI Feature B frontend. An analyst asks the threat history in plain English; the server
// (POST /api/nlp-query) turns it into a validated chartSpec + data, which we render with
// Recharts. Lives at /insights (NOT /ask-orbo — that's the chat Home). If the server can't
// map the question it returns { fallback }, which we show as a "try rephrasing" note.

const COLORS = ["var(--primary)", "var(--safe)", "var(--review)", "var(--danger)", "var(--ring)"];

const EXAMPLES = [
  "How many dangerous links this week?",
  "Break down all checks by verdict",
  "How many blacklisted domains?",
  "Show checks by review status",
];

// Render the chart for a { data, chartSpec } result.
const Chart = ({ data, chartSpec }) => {
  if (chartSpec.type === "count") {
    const total = data[0]?.value ?? 0;
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: "var(--primary)" }}>{total}</div>
        <div style={{ color: "var(--text-dim)" }}>{chartSpec.title}</div>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      {chartSpec.type === "line" ? (
        <LineChart data={data}>
          <XAxis dataKey="label" stroke="var(--text-dim)" fontSize={12} />
          <YAxis allowDecimals={false} stroke="var(--text-dim)" fontSize={12} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} />
        </LineChart>
      ) : chartSpec.type === "pie" ? (
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" outerRadius={110} label>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      ) : (
        <BarChart data={data}>
          <XAxis dataKey="label" stroke="var(--text-dim)" fontSize={12} />
          <YAxis allowDecimals={false} stroke="var(--text-dim)" fontSize={12} />
          <Tooltip />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
};

const Insights = () => {
  const { getToken } = useAuth();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { data, chartSpec } | null
  const [fallback, setFallback] = useState("");
  const [error, setError] = useState("");

  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text || busy) return;
    setBusy(true); setResult(null); setFallback(""); setError("");
    try {
      const res = await api.post("/api/nlp-query", { question: text }, { getToken });
      if (res.fallback) setFallback(res.fallback);
      else setResult(res);
    } catch (err) {
      setError(err.status === 403
        ? "Insights are available to analyst accounts."
        : "I couldn't run that just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => { e.preventDefault(); ask(); };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--navy)", display: "flex", alignItems: "center", gap: 10 }}>
        <Sparkles size={24} color="var(--primary)" /> Ask Orbo about your threats
      </h1>
      <p style={{ color: "var(--text-dim)", margin: "8px 0 24px" }}>
        Ask a question about your check history and Orbo turns it into a chart.
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. how many dangerous links this week?"
          disabled={busy}
          style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--text)", fontSize: "1em", outline: "none" }}
        />
        <button type="submit" disabled={busy || !question.trim()} aria-label="Ask"
          style={{ width: 48, borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff",
            cursor: busy || !question.trim() ? "default" : "pointer", display: "grid", placeItems: "center" }}>
          <Send size={18} />
        </button>
      </form>

      {/* example prompt chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => { setQuestion(ex); ask(ex); }} disabled={busy}
            style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text-dim)", fontSize: "0.85em", cursor: "pointer" }}>
            {ex}
          </button>
        ))}
      </div>

      {busy && <p style={{ color: "var(--text-dim)" }}>Orbo is crunching the numbers…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {fallback && (
        <div style={{ padding: 16, borderRadius: 12, background: "var(--review-bg)", color: "var(--review)" }}>
          {fallback}
        </div>
      )}
      {result && (
        <div style={{ padding: 20, borderRadius: 16, border: "1px solid var(--border)",
          background: "var(--surface)", boxShadow: "var(--shadow)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <BarChart3 size={18} color="var(--primary)" /> {result.chartSpec.title}
          </h2>
          <Chart data={result.data} chartSpec={result.chartSpec} />
        </div>
      )}
    </div>
  );
};

export default Insights;
