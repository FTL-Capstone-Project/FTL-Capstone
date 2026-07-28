import { useEffect, useState, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { X, ShieldCheck, Clock, FileCheck2, UserCheck, Layers } from "lucide-react";
import { api } from "../../lib/api.js";
import StatusBadge from "../../components/StatusBadge.jsx";
import StatusChip from "./StatusChip.jsx";
import WhyThisScore from "./WhyThisScore.jsx";

// The four authoritative review states an analyst can set. `value` must match the
// backend exactly (OrgReview.reviewStatus + the PATCH /review route's whitelist) and
// the StatusChip keys; `label` is what the analyst reads in the dropdown.
const REVIEW_STATUS_OPTIONS = [
  { value: "pending review",      label: "Pending review" },
  { value: "investigating",       label: "Investigating" },
  { value: "confirmed malicious", label: "Confirmed malicious" },
  { value: "confirmed safe",      label: "Confirmed safe" },
];

// ── Report detail modal (wireframes: "Orbis Reports_Page - Modal_Overlay") ──
// Opens when a report card is clicked. Shows the full verdict for one checked link.
//
// TWO PERSONA VARIANTS (this week's focus — individual + org member):
//   • individual (isMember=false): ONE "Orbo score" card (the AI verdict). No analyst.
//   • org member (isMember=true):  TWO cards — "Orbo score" AND "Analyst score".
//       - analyst HAS scored  → show the human score + "Scored by <analyst name>".
//       - analyst NOT yet     → "Awaiting analyst review" + the closure StatusChip.
//
// DATA: the parent (Reports.jsx) passes the list row it already has (`report`) so the
// modal renders instantly AND has the analyst's NAME (the detail endpoint omits it).
// On open we ALSO fetch GET /api/indicators/:id for the richer fields the list row
// doesn't carry (full ai_verdict, evidence/threat vectors, confidence, domain).

// Verdict word from a 0-100 SAFETY score (100 = safe). Mirrors David's scoreBucket.
const scoreKind = (score) => {
  if (score == null) return "review";
  if (score >= 70) return "safe";
  if (score >= 35) return "review";
  return "dangerous";
}

// THE ANALYST WINS. Which verdict the modal HEADER wears: the analyst's once they've
// recorded one, otherwise Orbo's. Mirrors the server's effectiveKind() in
// history.service.js — we recompute it here (instead of just reading report.kind) so the
// badge flips the instant an analyst saves, without waiting for the list to refetch.
// "pending review" / "investigating" are work-in-progress, NOT a verdict.
const effectiveKind = (aiScore, review) => {
  if (review?.human_score != null) return scoreKind(review.human_score);
  if (review?.review_status === "confirmed malicious") return "dangerous";
  if (review?.review_status === "confirmed safe") return "safe";
  return scoreKind(aiScore);
}

// Human-readable date for the review attribution line ("Priya S. · Jul 8, 2026").
const formatReviewDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const KIND_COLOR = { safe: "var(--safe)", review: "var(--review)", dangerous: "var(--danger)" };

// The two statuses that mean an analyst reached a CONCLUSION (vs. still working on it).
const CONFIRMED_STATUSES = ["confirmed malicious", "confirmed safe"];

// The three legs of a forwarded-email score, in the order they're analyzed. Plain-English labels:
// the API calls the middle one "body", but "message" is what a reader understands.
const LEG_LABELS = [["sender", "sender"], ["body", "message"], ["link", "links"]];

// How sure the scoring was, in plain English. `ai_confidence` is deterministic — it counts how
// many INDEPENDENT signals agreed (see computeSafetyScore in verdict.js), so it is NOT the
// model's opinion of itself. Worth showing because "91, and only one weak signal informed that"
// is a genuinely different situation from "91, corroborated three ways", and the number alone
// hides the difference.
const CONFIDENCE_NOTE = {
  high: "Several independent checks agreed on this.",
  medium: "A few checks informed this score.",
  low: "Only limited signals were available — treat this as a weak read.",
};

const ReportDetailModal = ({ report, isMember = false, isAnalyst = false, onClose }) => {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState(null); // richer fields from GET /api/indicators/:id
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false); // detail fetch errored → show a note
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  const prevFocusRef = useRef(null);
  // Read onClose through a ref so the mount effect below can have an EMPTY dep array
  // (it must run once, not re-run every time the parent hands us a new onClose fn).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Analyst review form state (only used/shown when isAnalyst). Prefilled ONCE from the
  // list row's existing review (via the useState initializer) so re-reviewing edits the
  // current values instead of blanking them. We intentionally do NOT re-sync from the
  // detail fetch — that would wipe whatever the analyst is typing when it lands.
  const [form, setForm] = useState(() => ({
    humanScore: report.review?.human_score != null ? String(report.review.human_score) : "",
    humanVerdict: report.review?.human_verdict ?? "",
    reviewStatus: report.review?.review_status ?? "pending review",
    sharedWithOrg: Boolean(report.review?.shared_with_org),
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Fetch the full indicator detail on open (evidence, full verdict, confidence, domain).
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFetchFailed(false);
    api.get(`/api/indicators/${report.indicator_id}`, { getToken })
      .then((data) => { if (active) setDetail(data); })
      .catch(() => { if (active) { setDetail(null); setFetchFailed(true); } }) // fall back to the list row
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [report.indicator_id, getToken]);

  // Modal behavior (runs ONCE for the modal's lifetime — empty deps): Escape closes,
  // body scroll locks, focus moves to the close button on open and is restored on close.
  // Tab/Shift+Tab is TRAPPED inside the dialog so keyboard focus can't reach the
  // obscured page behind the overlay.
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      // Keep focus cycling among the dialog's focusable elements.
      const focusables = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocusRef.current?.focus?.();
    };
  }, []);

  // ── Merge list row + fetched detail (detail wins where present) ──
  const title = report.title || detail?.title || report.url;
  const url = report.url || detail?.domain || "";
  const screenshotUrl = detail?.screenshot_url ?? report.screenshot_url ?? null;
  const aiScore = detail?.ai_score ?? report.ai_score ?? null;
  const orboKind = scoreKind(aiScore); // colors the "Orbo score" card only — always Orbo's own read
  // Full safety-analysis text: prefer the fuller ai_verdict, fall back to the card's description.
  const analysis = detail?.ai_verdict || report.description || null;
  // Threat vectors: prefer the fetched detail; fall back to the list row's evidence if
  // the parent supplied it (so a failed detail fetch doesn't blank the section).
  const evidence = Array.isArray(detail?.evidence) ? detail.evidence
    : Array.isArray(report.evidence) ? report.evidence
    : [];
  // Per-leg score breakdown (forwarded emails only — see buildLegsRow on the server). Null for URL
  // checks and for email reports scored before we started persisting it.
  const legs = detail?.legs ?? null;
  // What to DO about this result. Server-computed (see services/nextSteps.js) so this modal and the
  // emailed report always give the same advice, and so the advice can't contradict the score.
  const nextSteps = Array.isArray(detail?.next_steps) ? detail.next_steps : [];
  // How many independent signals agreed on the score ("low" | "medium" | "high").
  const confidence = detail?.ai_confidence ?? null;

  // Analyst review data. The detail fetch is the FRESHER source (it re-reads after a save),
  // so it wins; the list row is the fallback that makes the modal render instantly on open.
  const review = detail?.review ?? report.review ?? null;
  const analystName = review?.reviewed_by ?? report.review?.reviewed_by ?? null;
  const analystScore = review?.human_score ?? null;
  const analystNotes = review?.human_verdict ?? null;
  const reviewedAt = formatReviewDate(review?.reviewed_at);
  const reviewStatus = review?.review_status ?? "pending review";
  const analystHasScored = analystScore != null;
  // "Decided" is broader than "scored": closing something confirmed-malicious IS a verdict even with
  // no number typed. Drives whether we say "Awaiting analyst review" or "Closed by <name>".
  const analystDecided = analystHasScored || CONFIRMED_STATUSES.includes(reviewStatus);
  // The verdict the header badge shows — the analyst's if they've decided, else Orbo's.
  const kind = effectiveKind(aiScore, review);
  // Did a human actually overturn Orbo? Drives the "Analyst overrode Orbo" note so the
  // reader understands why the badge disagrees with the big Orbo number beside it.
  const analystOverrode = kind !== orboKind;

  // Refetch the indicator so the modal re-renders with the new human score + StatusChip.
  const refetchDetail = async () => {
    try {
      const data = await api.get(`/api/indicators/${report.indicator_id}`, { getToken });
      setDetail(data);
    } catch {
      // Non-fatal: the save succeeded; the view just won't auto-refresh this time.
    }
  }

  // Submit the analyst review → PATCH /api/indicators/:id/review (card G1·01's route).
  const handleReviewSubmit = async (event) => {
    event.preventDefault(); // don't let the browser reload the page on form submit
    setSubmitError(null);
    setSubmitting(true);
    try {
      // Score is optional, but if given it must be a whole number 0-100.
      const trimmedScore = String(form.humanScore).trim();
      const humanScore = trimmedScore === "" ? null : Number(trimmedScore);
      if (humanScore != null && (!Number.isInteger(humanScore) || humanScore < 0 || humanScore > 100)) {
        setSubmitError("Score must be a whole number between 0 and 100.");
        setSubmitting(false);
        return;
      }
      await api.patch(
        `/api/indicators/${report.indicator_id}/review`,
        {
          humanScore,
          humanVerdict: form.humanVerdict.trim() || null,
          reviewStatus: form.reviewStatus,
          sharedWithOrg: form.sharedWithOrg,
        },
        { getToken }
      );
      await refetchDetail(); // show the freshly-saved verdict without a page reload
    } catch (err) {
      setSubmitError(err.body?.error || "Couldn't save this review — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="orbis-scrim"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,37,64,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "40px 16px", overflowY: "auto" }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className="orbis-dialog"
        style={{ background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow)",
          width: "100%", maxWidth: 640, maxHeight: "calc(100vh - 80px)", overflowY: "auto",
          padding: 28 }}
      >
        {/* ── Header: title + verdict badge + close ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <h2 id="report-modal-title" style={{ margin: 0, flex: 1, minWidth: 0, fontSize: "1.35em",
            color: "var(--navy)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            overflowWrap: "anywhere" }}>
            {title}
            <StatusBadge kind={kind} />
          </h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            className="orbis-press"
            style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: "none",
              cursor: "pointer", background: "var(--canvas)", color: "var(--text-dim)",
              display: "grid", placeItems: "center" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Screenshot preview in browser chrome ── */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden",
          marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
            background: "var(--canvas)", borderBottom: "1px solid var(--border)" }}>
            <span style={{ display: "flex", gap: 5 }} aria-hidden>
              {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.5 }} />
              ))}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: "0.82em", color: KIND_COLOR[kind],
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {url}
            </span>
          </div>
          {screenshotUrl ? (
            <img src={screenshotUrl} alt="Sandbox preview of where this link leads"
              style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "cover", objectPosition: "top" }} />
          ) : (
            <div style={{ height: 200, background: "var(--border)", display: "grid", placeItems: "center",
              color: "var(--text-dim)", fontSize: "0.85em" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={16} /> No sandbox preview available
              </span>
            </div>
          )}
        </div>

        {/* ── Score card(s): the persona difference lives here ── */}
        <div style={{ display: "grid", gap: 12, marginBottom: 24,
          gridTemplateColumns: isMember ? "1fr 1fr" : "1fr" }}>
          {/* Orbo (AI) score — shown to everyone. Keeps ORBO's own color even when an analyst
              overrode it, so you can see the two verdicts differ instead of them silently agreeing. */}
          <ScoreCard label="Orbo score" score={aiScore} kind={orboKind} subtitle="Scored by Orbo (AI)"
            note={confidence ? CONFIDENCE_NOTE[confidence] ?? null : null} />

          {/* Analyst score — ORG MEMBERS ONLY */}
          {isMember && (
            analystHasScored ? (
              <ScoreCard
                label="Analyst score"
                score={analystScore}
                kind={scoreKind(analystScore)}
                subtitle={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Scored by
                    <span aria-hidden style={{ width: 14, height: 14, borderRadius: "50%",
                      background: "var(--primary)", display: "inline-block" }} />
                    <strong style={{ color: "var(--navy)" }}>{analystName ?? "an analyst"}</strong>
                  </span>
                }
              />
            ) : (
              // No analyst NUMBER yet. Two very different situations, and showing "Awaiting analyst
              // review" for both was its own contradiction: an analyst can close something
              // "confirmed malicious" WITHOUT typing a score, and this card would still say we were
              // waiting on them — right below a header badge already carrying their verdict.
              <div style={cardStyle}>
                <div style={cardLabelStyle}>Analyst score</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  padding: "8px 0" }}>
                  {analystDecided
                    ? <UserCheck size={26} color="var(--text-dim)" />
                    : <Clock size={26} color="var(--text-dim)" />}
                  <StatusChip status={reviewStatus} />
                </div>
                <div style={cardSubtitleStyle}>
                  {analystDecided
                    ? `Closed by ${analystName ?? "an analyst"}`
                    : "Awaiting analyst review"}
                </div>
              </div>
            )
          )}
        </div>

        {/* Per-leg breakdown — ANALYSTS ONLY. An email score is a worst-of across three legs, so
            "63/100" alone doesn't say whether the sender, the wording, or a link caused it. That's
            the first thing an analyst needs before writing an authoritative verdict. Only forwarded
            emails have legs; URL checks and older rows show nothing. */}
        {isAnalyst && legs && (
          <p style={{ margin: "-12px 0 24px", fontSize: "0.82em", color: "var(--text-dim)",
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Layers size={14} />
            <span>Score breakdown:</span>
            {LEG_LABELS.map(([key, label]) => (
              <span key={key}>
                {label} <strong style={{ color: "var(--text)" }}>{legs[key] ?? "n/a"}</strong>
              </span>
            ))}
          </p>
        )}

        {/* ── Safety analysis ── */}
        {analysis && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={sectionHeadingStyle}>Safety analysis</h3>
            <p style={{ margin: 0, color: "var(--text-dim)", lineHeight: 1.6 }}>{analysis}</p>
          </section>
        )}

        {/* ── Why this score: ranked concerns, collapsed reassurances, what to do ── */}
        {evidence.length > 0 || nextSteps.length > 0 ? (
          <WhyThisScore evidence={evidence} nextSteps={nextSteps} />
        ) : loading ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.88em" }}>Loading details…</p>
        ) : fetchFailed ? (
          <p style={{ color: "var(--text-dim)", fontSize: "0.88em" }}>
            Couldn't load the full threat details — try reopening this report.
          </p>
        ) : null}

        {/* ── Analyst Review authoring form — ANALYSTS ONLY (story #10) ──
            Frontend role gates DISPLAY only; the real security is the backend's
            requireAnalyst guard on PATCH /api/indicators/:id/review. */}
        {isAnalyst && (
          <section style={{ marginTop: 28, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
            <h3 style={{ ...sectionHeadingStyle, display: "flex", alignItems: "center", gap: 8 }}>
              <FileCheck2 size={18} /> Analyst Review
            </h3>
            {/* noValidate: let OUR JS validation + friendly message run on submit instead
                of the browser's native tooltip (min/max stay for the number spinner UX). */}
            <form onSubmit={handleReviewSubmit} noValidate>
              {/* Analysis notes → humanVerdict */}
              <textarea
                aria-label="Analysis notes"
                placeholder="Add your analysis notes…"
                value={form.humanVerdict}
                onChange={(e) => setForm((f) => ({ ...f, humanVerdict: e.target.value }))}
                rows={3}
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "10px 12px",
                  border: "1px solid var(--border)", borderRadius: 10, fontSize: "0.9em",
                  fontFamily: "inherit", color: "var(--text)", background: "var(--surface)" }}
              />

              {/* Score + status row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end",
                marginTop: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.8em",
                  color: "var(--text-dim)" }}>
                  Your Score
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      aria-label="Your score (0 to 100)"
                      value={form.humanScore}
                      onChange={(e) => setForm((f) => ({ ...f, humanScore: e.target.value }))}
                      style={{ width: 70, padding: "8px 10px", border: "1px solid var(--border)",
                        borderRadius: 10, fontSize: "0.95em", color: "var(--text)", background: "var(--surface)" }}
                    />
                    <span style={{ color: "var(--text-dim)", fontSize: "0.95em" }}>/ 100</span>
                  </span>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.8em",
                  color: "var(--text-dim)", flex: 1, minWidth: 160 }}>
                  Verdict
                  <select
                    aria-label="Review status"
                    value={form.reviewStatus}
                    onChange={(e) => setForm((f) => ({ ...f, reviewStatus: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
                      borderRadius: 10, fontSize: "0.95em", color: "var(--text)", background: "var(--surface)" }}
                  >
                    {REVIEW_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Share-with-org toggle → sharedWithOrg (the Team History privacy gate) */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14,
                fontSize: "0.85em", color: "var(--text)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.sharedWithOrg}
                  onChange={(e) => setForm((f) => ({ ...f, sharedWithOrg: e.target.checked }))}
                />
                Share this review with my organization (shows in Team History)
              </label>

              {submitError && (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85em", margin: "12px 0 0" }}>
                  {submitError}
                </p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  type="submit"
                  disabled={submitting}
                  className="orbis-press"
                  style={{ padding: "10px 20px", border: "none", borderRadius: 10, cursor: "pointer",
                    background: "var(--primary)", color: "#fff", fontSize: "0.9em", fontWeight: 700,
                    opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? "Saving…" : "Submit Review"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ── The analyst's verdict, ATTRIBUTED (wireframe: the signed block at the bottom) ──
            The whole point of analyst review is that a HUMAN closed the loop — so their decision
            has to be visible and signed. Before this, `human_verdict` was written to the DB and
            read back only to prefill the analyst's own form; the person who reported the link never
            saw a word of it. Sits last (per the wireframe) so an analyst reads it as "what was
            decided before" right under the form they're about to edit.
            Renders only once an analyst actually DECIDED — a score, notes, or a confirmed status.
            A bare "pending review" is a ticket being opened, not a verdict. */}
        {review && (analystHasScored || analystNotes || CONFIRMED_STATUSES.includes(reviewStatus)) && (
          <section
            // Named, not headed: the wireframe shows no heading over this block (the attribution
            // row IS the label), but screen-reader users still need to know what the region is.
            aria-label="Analyst verdict"
            style={{ marginTop: 20, border: "1px solid var(--border)", borderRadius: 12,
              padding: 16, background: "var(--canvas)" }}
          >
            {/* Attribution row: who decided, when (left) · what they decided (right) */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span aria-hidden style={{ width: 26, height: 26, borderRadius: "50%",
                background: "var(--primary)", color: "#fff", fontSize: "0.75em", fontWeight: 700,
                display: "grid", placeItems: "center", flexShrink: 0 }}>
                {(analystName ?? "A").trim().charAt(0).toUpperCase()}
              </span>
              <span style={{ fontSize: "0.9em", color: "var(--navy)", fontWeight: 700 }}>
                {analystName ?? "Security analyst"}
              </span>
              {reviewedAt && (
                <span style={{ fontSize: "0.82em", color: "var(--text-dim)" }}>· {reviewedAt}</span>
              )}
              {/* marginLeft:auto pushes the verdict pill to the right edge, as in the wireframe. */}
              <span style={{ marginLeft: "auto" }}><StatusChip status={reviewStatus} /></span>
            </div>

            {/* The analyst's own words. pre-wrap so their line breaks survive. */}
            {analystNotes && (
              <p style={{ margin: "12px 0 0", color: "var(--text)", lineHeight: 1.6,
                fontSize: "0.92em", whiteSpace: "pre-wrap" }}>
                {analystNotes}
              </p>
            )}

            {/* Explain the disagreement instead of leaving two clashing verdicts on screen. */}
            {analystOverrode && (
              <p style={{ margin: "12px 0 0", color: "var(--text-dim)", fontSize: "0.82em",
                display: "flex", alignItems: "center", gap: 6 }}>
                <UserCheck size={14} />
                This human review overrides Orbo's automated score.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// One "Orbo score" / "Analyst score" card: big number /100 + a track + a subtitle line.
//
// The track is the ONE genuinely quantitative mark in the report: the score really is a ratio
// out of 100, so a bar whose fill is score/100 is honest. (The old per-row "threat vector" bars
// were not — they were three fixed lengths pretending to be measurements.) It also gives the
// number a shape you can compare at a glance between the Orbo and Analyst cards.
const ScoreCard = ({ label, score, kind, subtitle, note }) => {
  const hasScore = typeof score === "number";
  return (
    <div style={cardStyle}>
      <div style={cardLabelStyle}>{label}</div>
      <div style={{ textAlign: "center", margin: "6px 0" }}>
        <span style={{ fontSize: "2.6em", fontWeight: 800, color: KIND_COLOR[kind] }}>
          {score ?? "—"}
        </span>
        <span style={{ fontSize: "1em", color: "var(--text-dim)" }}>/100</span>
      </div>
      {hasScore && (
        // role="img" + a label: a screen reader gets "Safety score 91 out of 100" instead of
        // silence, since the bar itself is a pair of empty divs.
        <div role="img" aria-label={`${label}: ${score} out of 100`}
          style={{ height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden",
            margin: "0 0 10px" }}>
          {/* orbis-bar-fill sweeps the fill out from the left on open. It animates scaleX, not
              width, so the bar's real width stays exactly score% — the animation can't lie about
              the number, it just reveals it. */}
          <div className="orbis-bar-fill"
            style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: "100%",
            borderRadius: 999, background: KIND_COLOR[kind] }} />
        </div>
      )}
      <div style={cardSubtitleStyle}>{subtitle}</div>
      {/* Confidence caveat — only when we have one. Keeps a high score from reading as a
          guarantee when few signals actually agreed on it. */}
      {note && (
        <div style={{ ...cardSubtitleStyle, marginTop: 6, fontStyle: "italic" }}>{note}</div>
      )}
    </div>
  );
}

// ── shared inline style objects (keeps the JSX readable) ──
const cardStyle = {
  background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: 12, padding: 16,
  display: "flex", flexDirection: "column", justifyContent: "space-between",
};
const cardLabelStyle = { textAlign: "center", color: "var(--text-dim)", fontSize: "0.85em" };
const cardSubtitleStyle = {
  textAlign: "center", color: "var(--text-dim)", fontSize: "0.8em",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
};
const sectionHeadingStyle = { margin: "0 0 10px", color: "var(--navy)", fontSize: "1.05em" };

export default ReportDetailModal;
