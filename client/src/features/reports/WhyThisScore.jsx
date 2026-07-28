// ── feature: reports · owner: Ozias ──
// "Why this score" — the explanation panel in the report detail modal. Replaces the old
// "Threat vectors" list, which had three problems the user called out:
//
//   1. It mixed THREATS and REASSURANCES under a heading that said "Threat vectors", so
//      "Domain matches a well-known company" was presented as if it were a threat.
//   2. Its bar length was one of three fixed constants (92% / 58% / 28%). A bar that looks
//      measured but isn't is worse than no bar — so bars are gone. Where we know a signal's
//      real cost we print it ("−6 pts"); where we don't, we print nothing and let the ranking
//      speak. The list arrives already sorted worst-first from the server (reconcileEvidence).
//   3. Severity was communicated by COLOR ALONE. Our amber and green are close enough that a
//      red/green-colorblind reader can't reliably tell them apart, so splitting the rows into
//      two LABELED groups is what actually makes the panel readable — the group heading carries
//      the meaning, and the color is only a reinforcement.
//
// Props:
//   evidence  — [{ text, severity: "safe"|"review"|"dangerous", weight? }] from
//               GET /api/indicators/:id. `weight` is the signal's real danger cost when we have
//               one (email-body signals and URL rubric hits); absent on model-written rows.
//   nextSteps — ["Verify with the sender…", …] plain strings from the server, so the advice can
//               never contradict the score (code picks it, not the AI).
import { useState } from "react";
// ChevronRight is gone on purpose — the collapse now rotates a single ChevronDown instead of
// swapping between two icons (see the button below).
import { AlertTriangle, ShieldCheck, ChevronDown, Compass } from "lucide-react";

// Severity → theme color for the row dot. Same three tokens EvidenceList uses in the chat card,
// so a "why" row looks the same wherever it appears.
const DOT = { safe: "var(--safe)", review: "var(--review)", dangerous: "var(--danger)" };

// One evidence row: severity dot + the sentence + (only when we actually know it) what that
// signal cost the score. The real minus sign (−, U+2212) instead of a hyphen so it reads as
// arithmetic and lines up.
const EvidenceRow = ({ text, severity, weight }) => {
  // No cost on a reassurance row. When the final score lands in the safe band, the server clamps
  // every row's severity down to "safe" so no amber dot sits under a green badge — but the row keeps
  // the weight it was scored with. Printing "−6 pts" under the heading "What checked out" would
  // contradict the heading, so the chip only appears where the row is presented as a concern.
  const showCost = typeof weight === "number" && weight > 0 && severity !== "safe";
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
        marginTop: 6, background: DOT[severity] ?? "var(--text-dim)" }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: "0.92em", color: "var(--text)",
        lineHeight: 1.5, overflowWrap: "anywhere" }}>
        {text}
      </span>
      {showCost && (
        <span
          // The cost is the honest magnitude: "this signal took 6 points off the score".
          // Deliberately NOT colored — the dot already carries severity, and a colored number
          // would be a second color-only channel.
          title="How much this signal lowered the safety score"
          style={{ flexShrink: 0, fontSize: "0.78em", fontWeight: 700, color: "var(--text-dim)",
            background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: 999,
            padding: "1px 8px", whiteSpace: "nowrap" }}
        >
          −{weight} pts
        </span>
      )}
    </li>
  );
}

// A labeled group of rows. `icon` + `title` are the secondary encoding that lets the panel work
// without color at all.
const EvidenceGroup = ({ icon, title, rows }) => (
  <div>
    <h4 style={groupHeadingStyle}>
      {icon}
      {title} ({rows.length})
    </h4>
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {rows.map((row, i) => (
        <EvidenceRow key={i} text={row.text} severity={row.severity} weight={row.weight} />
      ))}
    </ul>
  </div>
);

const WhyThisScore = ({ evidence = [], nextSteps = [] }) => {
  // Split the one flat list into the two things a reader actually wants to know apart:
  // what went WRONG, and what we checked that was FINE.
  const rows = Array.isArray(evidence) ? evidence : [];
  const concerns = rows.filter((row) => row?.text && row.severity !== "safe");
  const checks = rows.filter((row) => row?.text && row.severity === "safe");
  const steps = Array.isArray(nextSteps) ? nextSteps.filter(Boolean) : [];

  // The reassurances start COLLAPSED so the concerns are what you see first — unless there are
  // no concerns at all, in which case collapsing everything would leave an empty-looking panel,
  // so we open them (they're the whole story on a clean check).
  const [checksOpen, setChecksOpen] = useState(concerns.length === 0);

  // Nothing to explain → render nothing, and let the modal show its loading / error state.
  if (concerns.length === 0 && checks.length === 0 && steps.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 12px", color: "var(--navy)", fontSize: "1.05em" }}>
        Why this score
      </h3>

      <div style={{ display: "grid", gap: 16 }}>
        {concerns.length > 0 && (
          <EvidenceGroup
            icon={<AlertTriangle size={15} color="var(--review)" aria-hidden />}
            title="What raised concern"
            rows={concerns}
          />
        )}

        {checks.length > 0 && (
          <div>
            {/* A <button>, deliberately NOT <details>/<summary>: the modal traps Tab inside
                itself by querying for button/input/select/textarea/[href], and <summary> isn't
                in that list — so a <summary> here would quietly fall outside the focus trap and
                keyboard users could tab behind the overlay. */}
            <button
              type="button"
              onClick={() => setChecksOpen((open) => !open)}
              aria-expanded={checksOpen}
              aria-controls="why-checks-list"
              style={{ ...groupHeadingStyle, display: "flex", alignItems: "center", gap: 8,
                width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer",
                font: "inherit", textAlign: "left" }}
            >
              <ShieldCheck size={15} color="var(--safe)" aria-hidden />
              What checked out ({checks.length})
              {/* ONE chevron that rotates, rather than swapping ChevronRight for ChevronDown. The
                  rotation shows the panel opening; an icon swap is just a different picture
                  appearing, which teaches the reader nothing. data-open drives the CSS. */}
              <ChevronDown size={15} aria-hidden className="orbis-chevron"
                data-open={checksOpen} style={{ marginLeft: "auto" }} />
            </button>
            {checksOpen && (
              <ul id="why-checks-list" className="orbis-reveal"
                style={{ listStyle: "none", margin: "8px 0 0", padding: 0,
                display: "grid", gap: 8 }}>
                {checks.map((row, i) => (
                  <EvidenceRow key={i} text={row.text} severity={row.severity} weight={row.weight} />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* What to DO about it — the thing the report never used to say. These strings come from
            the server so the modal and the emailed report give identical advice, and so the
            advice is picked by code from the bucket + signals (it can't contradict the score the
            way a model-written sentence can). */}
        {steps.length > 0 && (
          <div>
            <h4 style={groupHeadingStyle}>
              <Compass size={15} color="var(--primary)" aria-hidden />
              What to do
            </h4>
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
              {steps.map((step, i) => (
                <li key={i} style={{ fontSize: "0.92em", color: "var(--text)", lineHeight: 1.5 }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

// Shared look for the three group headings (concerns / checks / what to do), including the
// collapse button — so the button doesn't look like a different kind of thing than the others.
const groupHeadingStyle = {
  margin: "0 0 8px", fontSize: "0.8em", fontWeight: 700, color: "var(--text-dim)",
  textTransform: "uppercase", letterSpacing: "0.06em",
  display: "flex", alignItems: "center", gap: 8,
};

export default WhyThisScore;
