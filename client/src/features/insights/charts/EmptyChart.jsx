// ── feature: insights · EmptyChart · owner: Ozias ──
// The shared "this report has nothing to show yet" panel for the named Insights reports.
//
// Why it exists: an org with no matching submissions used to make some charts render their
// FRAME with no content — an all-grey 7×8 heatmap grid, or empty axes with a legend. That reads
// like a broken screen rather than "you have no data yet", and it's the common case for a new
// org or a quiet week. Each report passes its own sentence so the wording stays specific
// ("no submissions in the last 30 days" vs "no scored submissions").
//
// Real icon, not an emoji, per code-style.md.
import { Inbox } from "lucide-react";

const EmptyChart = ({ message }) => {
  return (
    <div style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-dim)" }}>
      <Inbox size={28} style={{ opacity: 0.5 }} />
      <p style={{ margin: "10px 0 0", fontSize: "0.92em" }}>{message}</p>
    </div>
  );
};

export default EmptyChart;
