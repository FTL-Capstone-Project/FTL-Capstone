// ── feature: insights · BucketCount · owner: Ozias ──
// "How many dangerous links this week?" — the NUMBER plus the links behind it.
//
// Why not just the number: a bare "8" is a dead end. An analyst's next question is always
// "which ones?", and answering it meant leaving Insights for the triage queue. So the count
// leads, and underneath sits the evidence — each link with the detail needed to triage it:
// its score, attack type, who reported it, when, how many people hit it, and whether a
// blacklist already knows it. Clicking a row opens that report in the triage queue.
//
// Data comes from chartSpec.type === "bucketCount":
//   data      = [{ indicatorId, title, domain, score, band, tag, blacklisted,
//                  reportedBy, reportedAt, reportCount }]  — most dangerous first
//   chartSpec = { title, total, reportTotal, band, empty }
import { Link } from "react-router-dom";
import { ShieldAlert, Ban, Users, ArrowUpRight } from "lucide-react";
import { VERDICT_COLOR } from "../../../lib/chartConfig.js";
import EmptyChart from "./EmptyChart.jsx";

// Tinted pill background per verdict band, matching the report cards elsewhere in the app.
const BAND_BG = {
  safe: "var(--safe-bg)",
  review: "var(--review-bg)",
  dangerous: "var(--danger-bg)",
};

// "2 days ago" — a relative date is easier to triage on than a timestamp. Kept local because
// it's the only place Insights shows a per-report date.
const relativeDay = (value) => {
  const then = new Date(value);
  if (isNaN(then.getTime())) return null;
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

const LinkRow = ({ link }) => {
  const color = VERDICT_COLOR[link.band] ?? "var(--text-dim)";
  const when = relativeDay(link.reportedAt);

  return (
    <Link
      to={`/reports?q=${encodeURIComponent(link.domain ?? "")}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
          borderRadius: 10, background: "var(--canvas)", border: "1px solid var(--border)" }}
      >
        {/* The score is the headline number for each row — big enough to scan down the column. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46 }}>
          <span style={{ fontWeight: 800, fontSize: "1.15em", color }}>{link.score ?? "—"}</span>
          <span style={{ fontSize: "0.62em", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            score
          </span>
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: "var(--navy)", fontSize: "0.92em" }}>{link.title}</span>
            {/* A blacklist hit is the strongest signal on the row, so it gets its own badge. */}
            {link.blacklisted && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.7em",
                fontWeight: 700, color: "var(--danger)", background: "var(--danger-bg)",
                padding: "2px 7px", borderRadius: 999 }}>
                <Ban size={11} /> Blacklisted
              </span>
            )}
          </div>
          {/* One dim line of context: domain · attack type · who reported it · when. */}
          <div style={{ color: "var(--text-dim)", fontSize: "0.78em", marginTop: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[link.domain, link.tag, `${link.reportedBy}${when ? `, ${when}` : ""}`].filter(Boolean).join(" · ")}
          </div>
        </div>

        {/* Repeat reports = more people exposed. Only shown when it's more than one. */}
        {link.reportCount > 1 && (
          <span title={`${link.reportCount} people reported this link`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75em",
              fontWeight: 700, color: "var(--review)", background: "var(--review-bg)",
              padding: "3px 8px", borderRadius: 999, flexShrink: 0 }}>
            <Users size={12} /> {link.reportCount}
          </span>
        )}
        <ArrowUpRight size={15} color="var(--text-dim)" style={{ flexShrink: 0 }} />
      </div>
    </Link>
  );
};

const BucketCount = ({ data, chartSpec }) => {
  const { title, total, reportTotal, band, empty } = chartSpec;

  // Zero is a real answer here and it's GOOD news, so say that plainly rather than showing an
  // "no data" panel — unless the org has no submissions at all (empty), where there's nothing
  // to have counted in the first place.
  if (empty && total === 0) {
    return <EmptyChart message="No submissions in your organization yet, so there's nothing to count." />;
  }
  if (total === 0) {
    return <EmptyChart message="None found — nothing matched that question for your organization." />;
  }

  const color = VERDICT_COLOR[band] ?? "var(--primary)";

  return (
    <div>
      {/* The count, with the verdict's own colour so "8 dangerous" reads as bad at a glance. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px",
        borderRadius: 12, background: BAND_BG[band] ?? "var(--canvas)", marginBottom: 18 }}>
        <ShieldAlert size={26} color={color} style={{ flexShrink: 0 }} />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color }}>{total}</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>
            {title}
            {/* Reports vs links are different numbers when a link was reported more than once —
                spelling both out prevents "but the queue shows more rows than this" confusion. */}
            {reportTotal > total && ` · ${reportTotal} reports across ${total} link${total === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <p style={{ color: "var(--text-dim)", fontSize: "0.78em", textTransform: "uppercase",
        letterSpacing: "0.04em", margin: "0 0 8px" }}>
        Most dangerous first
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {data.map((link) => <LinkRow key={link.indicatorId} link={link} />)}
      </div>
    </div>
  );
};

export default BucketCount;
