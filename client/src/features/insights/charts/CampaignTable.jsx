// ── feature: insights · CampaignTable · owner: Ozias ──
// "Active Threat Campaigns" — the one Ask-Orbo answer that is a TABLE, not a chart, because the
// interesting thing about campaigns is comparing rows (items · avg score · status), not a shape.
// Two halves, per the wireframe: a bar strip ranking campaigns by size, then the detail table.
//
// Data comes from chartSpec.type === "table":
//   data = [{ id, name, indicatorCount, reportCount, avgScore, band, status, last_seen }]
// Same field names the triage queue already renders (both come from listCampaigns on the server),
// so there's nothing to reconcile between the two screens.
import { VERDICT_COLOR } from "../../../lib/chartConfig.js";
import EmptyChart from "./EmptyChart.jsx";

// A campaign's status badge colour follows its verdict band: Active(dangerous) → Monitoring →
// Contained(safe). Derived server-side so the label and the colour can't disagree.
const STATUS_BG = {
  dangerous: "var(--danger-bg)",
  review: "var(--review-bg)",
  safe: "var(--safe-bg)",
};

const cell = { padding: "12px 10px", textAlign: "left", fontSize: "0.9em" };
const headCell = { ...cell, color: "var(--text-dim)", fontSize: "0.72em", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 };

const CampaignTable = ({ data, chartSpec }) => {
  const { subtitle } = chartSpec;
  const mostItems = Math.max(1, ...data.map((c) => c.indicatorCount)); // bar strip scale

  if (data.length === 0) {
    return <EmptyChart message="No campaigns detected for your organization yet." />;
  }

  return (
    <div>
      {subtitle && (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85em", margin: "0 0 16px" }}>{subtitle}</p>
      )}

      {/* Bar strip: campaign size at a glance, ranked as the table is (worst score first). */}
      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        {data.map((campaign) => (
          <div key={campaign.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 190, color: "var(--text)", fontSize: "0.85em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {campaign.name}
            </span>
            <div style={{ flex: 1, height: 10, borderRadius: 999, background: "var(--canvas)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${(campaign.indicatorCount / mostItems) * 100}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: VERDICT_COLOR[campaign.band],
                }}
              />
            </div>
            <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: "0.85em", minWidth: 28, textAlign: "right" }}>
              {campaign.indicatorCount}
            </span>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--canvas)" }}>
              <th style={headCell}>Campaign</th>
              <th style={headCell}>Items</th>
              <th style={headCell}>Reports</th>
              <th style={headCell}>Avg score</th>
              <th style={headCell}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((campaign) => (
              <tr key={campaign.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ ...cell, fontWeight: 600, color: "var(--navy)" }}>{campaign.name}</td>
                <td style={cell}>{campaign.indicatorCount}</td>
                <td style={cell}>{campaign.reportCount}</td>
                <td style={{ ...cell, fontWeight: 700, color: VERDICT_COLOR[campaign.band] }}>
                  {campaign.avgScore == null ? "—" : `${campaign.avgScore}/100`}
                </td>
                <td style={cell}>
                  <span
                    style={{
                      padding: "4px 10px", borderRadius: 999, fontSize: "0.8em", fontWeight: 600,
                      background: STATUS_BG[campaign.band], color: VERDICT_COLOR[campaign.band],
                    }}
                  >
                    {campaign.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CampaignTable;
