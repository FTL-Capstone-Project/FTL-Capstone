// ── feature: insights · ScoreHistogram · owner: Ozias ──
// "Orbis Score Distribution" — how the org's safety scores spread across 0-100, in ten buckets,
// each bar coloured by its verdict band. Answers "is Orbo confident, or is everything mushy in
// the middle?" A bimodal shape (lots at both ends) means clean detection.
//
// Data comes from chartSpec.type === "histogram":
//   data      = [{ label: "0–9", value: count, band: "dangerous"|"review"|"safe" }] × 10
//   chartSpec = { bands: [{ band, label, count, pct }], subtitle }
//
// The band edges are the server's (scoreBucket: safe ≥70 · review ≥35), NOT the wireframe's
// 0-33/34-66/67-100 — the code is the single source of truth the whole app shares, so the
// legend labels the real thresholds.
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { VERDICT_COLOR, defaultAxisProps, defaultTooltipStyle } from "../../../lib/chartConfig.js";
import EmptyChart from "./EmptyChart.jsx";

const ScoreHistogram = ({ data, chartSpec }) => {
  const { bands, subtitle } = chartSpec;

  // All ten buckets always come back, so "no data" means every bucket is zero — otherwise the
  // analyst sees a flat axis plus a legend reading "0 submissions · 0%" three times over.
  if (chartSpec.empty || !data.some((bucket) => bucket.value > 0)) {
    return <EmptyChart message="No scored submissions yet, so there's no score distribution to show." />;
  }

  return (
    <div>
      {subtitle && (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "0 0 12px" }}>{subtitle}</p>
      )}

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis dataKey="label" {...defaultAxisProps} />
          <YAxis allowDecimals={false} {...defaultAxisProps} />
          <Tooltip {...defaultTooltipStyle} formatter={(value) => [`${value} submissions`, "Count"]} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {/* Colour each bucket by the verdict band it falls in — the shape AND the colour
                both tell the story, so it reads correctly in greyscale too. */}
            {data.map((bucket, i) => (
              <Cell key={i} fill={VERDICT_COLOR[bucket.band]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend: count + share per band, with the real score edges */}
      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {bands.map((band) => (
          <div
            key={band.band}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 10, background: "var(--canvas)",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: VERDICT_COLOR[band.band], flexShrink: 0 }} />
            <span style={{ color: "var(--text)", fontSize: "0.9em" }}>{band.label}</span>
            <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: "0.85em" }}>
              {band.count} submission{band.count === 1 ? "" : "s"}
            </span>
            <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: "0.9em", minWidth: 52, textAlign: "right" }}>
              {band.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScoreHistogram;
