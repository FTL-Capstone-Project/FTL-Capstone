// ── feature: dashboard · SubmissionHistoryChart · owner: Michael ──
// "My Submission History" — a hand-built CSS bar chart (no chart lib) of daily
// check counts over the last 30 days. Each bar's height is scaled to the busiest
// day; zero-count days render a faint baseline nub so the axis stays continuous.
// Hovering a bar shows its date + count (native title tooltip).

export default function SubmissionHistoryChart({ history }) {
  const max = Math.max(1, ...history.map((d) => d.count)); // avoid divide-by-zero
  const totalChecks = history.reduce((sum, d) => sum + d.count, 0);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: 0 }}>My Submission History</h2>
        <span style={{ color: "var(--text-dim)", fontSize: "0.8em" }}>Past 30 days</span>
      </div>

      {totalChecks === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "24px 0" }}>
          No checks in the last 30 days yet.
        </p>
      ) : (
        <>
          {/* Bars */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
            {history.map((d) => {
              const pct = (d.count / max) * 100;
              return (
                <div
                  key={d.date}
                  title={`${formatDate(d.date)}: ${d.count} check${d.count === 1 ? "" : "s"}`}
                  style={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(pct, d.count > 0 ? 6 : 2)}%`, // min height so tiny/zero days are visible
                      background: d.count > 0 ? "var(--primary)" : "var(--border)",
                      borderRadius: "3px 3px 0 0",
                      transition: "height 0.2s",
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* x-axis: first + last day labels only (30 labels would be noise) */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, color: "var(--text-dim)", fontSize: "0.72em" }}>
            <span>{formatDate(history[0].date)}</span>
            <span>{formatDate(history[history.length - 1].date)}</span>
          </div>
        </>
      )}
    </div>
  );
}

// "2026-07-14" → "Jul 14"
function formatDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${month} ${d}`;
}
