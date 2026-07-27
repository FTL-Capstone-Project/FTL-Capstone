// ── feature: insights · HeatmapChart · owner: Ozias ──
// "Submission Activity Heatmap" — WHEN threats get submitted, as a day × time-of-day grid.
// Built with a plain CSS grid rather than a chart library: a heatmap is just coloured boxes, and
// Recharts has no first-class heatmap, so a grid is both smaller and easier to read.
//
// Data comes from chartSpec.type === "heatmap":
//   data      = [{ day: 0-6 (Mon-first), slot: 0-7 (3-hour blocks), value: count }]  — all 56 cells
//   chartSpec = { days: ["Mon",…], slots: ["12am",…], max, subtitle }
// The server always sends every cell, so we never have to guess at gaps.

// Colour ramp: one hue (danger red, like the wireframe) at five opacities. We scale each cell
// against the busiest cell (chartSpec.max) so the ramp always uses its full range.
const STEPS = [0.12, 0.3, 0.5, 0.75, 1];

const opacityFor = (value, max) => {
  if (!value) return 0;                              // zero stays a neutral empty box
  if (max <= 1) return STEPS[STEPS.length - 1];      // a single submission is the busiest cell
  const ratio = value / max;
  const index = Math.min(STEPS.length - 1, Math.floor(ratio * STEPS.length));
  return STEPS[index];
};

const Cell = ({ value, max }) => {
  const opacity = opacityFor(value, max);
  return (
    <div
      title={`${value} submission${value === 1 ? "" : "s"}`}
      style={{
        height: 22,
        borderRadius: 4,
        // Zero-count cells get the neutral border colour so the grid still reads as a grid.
        background: opacity === 0 ? "var(--border)" : "var(--danger)",
        opacity: opacity === 0 ? 0.35 : opacity,
      }}
    />
  );
};

const HeatmapChart = ({ data, chartSpec }) => {
  const { days, slots, max, subtitle } = chartSpec;

  // Index the flat cell list by "day:slot" so each grid position is a direct lookup.
  const byCell = new Map(data.map((c) => [`${c.day}:${c.slot}`, c.value]));

  // One label column + one column per time slot.
  const columns = `44px repeat(${slots.length}, 1fr)`;

  return (
    <div>
      {subtitle && (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "0 0 16px" }}>{subtitle}</p>
      )}

      {/* time-of-day headings */}
      <div style={{ display: "grid", gridTemplateColumns: columns, gap: 6, marginBottom: 6 }}>
        <span />
        {slots.map((slot) => (
          <span key={slot} style={{ color: "var(--text-dim)", fontSize: "0.72em", textAlign: "center" }}>
            {slot}
          </span>
        ))}
      </div>

      {/* one row per day */}
      {days.map((dayLabel, day) => (
        <div key={dayLabel} style={{ display: "grid", gridTemplateColumns: columns, gap: 6, marginBottom: 6, alignItems: "center" }}>
          <span style={{ color: "var(--text-dim)", fontSize: "0.78em" }}>{dayLabel}</span>
          {slots.map((_, slot) => (
            <Cell key={slot} value={byCell.get(`${day}:${slot}`) ?? 0} max={max} />
          ))}
        </div>
      ))}

      {/* Low → High legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
        <span style={{ color: "var(--text-dim)", fontSize: "0.78em" }}>Low</span>
        {[0, ...STEPS].map((step, i) => (
          <span
            key={i}
            style={{
              width: 28,
              height: 10,
              borderRadius: 3,
              background: step === 0 ? "var(--border)" : "var(--danger)",
              opacity: step === 0 ? 0.35 : step,
            }}
          />
        ))}
        <span style={{ color: "var(--text-dim)", fontSize: "0.78em" }}>High</span>
      </div>
    </div>
  );
};

export default HeatmapChart;
