// ── feature: dashboard · ResultsDonut · owner: Michael ──
// "My Results" — a hand-built SVG donut (no chart lib) showing the caller's checks
// split into Safe / Suspicious / Dangerous, with the total in the center and a
// legend with counts + percentages. Colors are the verdict theme tokens.
//
// How the ring works: one <circle> per segment, all sharing the same radius. We
// use stroke-dasharray to draw each arc's length and stroke-dashoffset to rotate
// it to start where the previous segment ended. Rotated -90° so it begins at 12 o'clock.

const SIZE = 180;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

const SEGMENTS = [
  { key: "safe", label: "Safe", color: "var(--safe)" },
  { key: "suspicious", label: "Suspicious", color: "var(--review)" },
  { key: "dangerous", label: "Dangerous", color: "var(--danger)" },
];

export default function ResultsDonut({ results }) {
  const total = results.total || 0;

  // Build the arc list (skip zero-count segments so there's no invisible stroke).
  let offset = 0;
  const arcs = SEGMENTS.map((seg) => {
    const count = results[seg.key] || 0;
    const fraction = total === 0 ? 0 : count / total;
    const len = fraction * CIRC;
    const arc = { ...seg, count, fraction, len, dashOffset: offset };
    offset += len;
    return arc;
  });

  return (
    <Card>
      <h2 style={{ color: "var(--navy)", fontSize: "1.05em", margin: "0 0 12px" }}>My Results</h2>

      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        {/* The ring */}
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Results breakdown">
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {/* track (empty state or gaps) */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--border)"
              strokeWidth={STROKE}
            />
            {total > 0 &&
              arcs.map(
                (a) =>
                  a.count > 0 && (
                    <circle
                      key={a.key}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={a.color}
                      strokeWidth={STROKE}
                      strokeDasharray={`${a.len} ${CIRC - a.len}`}
                      strokeDashoffset={-a.dashOffset}
                    />
                  )
              )}
          </g>
          {/* center total */}
          <text x="50%" y="47%" textAnchor="middle" style={{ fontSize: 30, fontWeight: 800, fill: "var(--navy)" }}>
            {total}
          </text>
          <text x="50%" y="60%" textAnchor="middle" style={{ fontSize: 12, fill: "var(--text-dim)" }}>
            Total
          </text>
        </svg>

        {/* Legend */}
        <div style={{ flex: 1, minWidth: 160, display: "grid", gap: 10 }}>
          {arcs.map((a) => (
            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 }} />
              <span style={{ color: "var(--text)", fontSize: "0.9em" }}>{a.label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--navy)", fontSize: "0.9em" }}>
                {total === 0 ? "0%" : `${Math.round(a.fraction * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Card({ children }) {
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
      {children}
    </div>
  );
}
