// ── report card · row-actions menu · owner: David ──
// The "⋯" archive/restore/delete menu is OPT-IN: it only appears when the parent passes an
// action callback. This matters because the analyst TriageQueue reuses ReportCard WITHOUT those
// props, so it must never show a Delete button. Tests:
//   • no action props → no menu button at all (TriageQueue's case)
//   • active row → "Archive"; archived row → "Restore"
//   • clicking an item fires its callback and does NOT open the card (stopPropagation)
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { default: ReportCard } = await import("./ReportCard.jsx");

const baseReport = {
  indicator_id: 7,
  title: "Fake PayPal login",
  url: "https://paypa1-secure.com/verify",
  kind: "dangerous",
  ai_score: 20,
  tags: [],
};

describe("ReportCard row-actions menu", () => {
  it("shows NO options button when no action callbacks are passed (analyst/TriageQueue case)", () => {
    render(<ReportCard report={baseReport} onOpen={() => {}} />);
    expect(screen.queryByRole("button", { name: /report options/i })).not.toBeInTheDocument();
  });

  it("active row → menu offers Archive + Delete (not Restore)", async () => {
    const user = userEvent.setup();
    render(<ReportCard report={baseReport} onOpen={() => {}} onArchive={() => {}} onDelete={() => {}} />);

    await user.click(screen.getByRole("button", { name: /report options/i }));
    expect(screen.getByRole("menuitem", { name: /archive/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /restore/i })).not.toBeInTheDocument();
  });

  it("archived row → menu offers Restore instead of Archive", async () => {
    const user = userEvent.setup();
    render(<ReportCard report={baseReport} onOpen={() => {}} isArchived onRestore={() => {}} onDelete={() => {}} />);

    await user.click(screen.getByRole("button", { name: /report options/i }));
    expect(screen.getByRole("menuitem", { name: /restore/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^archive$/i })).not.toBeInTheDocument();
  });

  it("clicking Archive fires onArchive and does NOT open the card (stopPropagation)", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const onOpen = vi.fn();
    render(<ReportCard report={baseReport} onOpen={onOpen} onArchive={onArchive} onDelete={() => {}} />);

    await user.click(screen.getByRole("button", { name: /report options/i }));
    await user.click(screen.getByRole("menuitem", { name: /archive/i }));

    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled(); // the menu click must not bubble to the card overlay
  });

  it("clicking Delete fires onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ReportCard report={baseReport} onOpen={() => {}} onArchive={() => {}} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /report options/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("no onDelete → Delete is not rendered (member archive-only case), menu still opens", async () => {
    const user = userEvent.setup();
    render(<ReportCard report={baseReport} onOpen={() => {}} onArchive={() => {}} />);

    await user.click(screen.getByRole("button", { name: /report options/i }));
    expect(screen.getByRole("menuitem", { name: /archive/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument();
  });
});

// The card must never contradict itself. `kind` (the badge) now follows the ANALYST when a human has
// overridden Orbo (effectiveKind in history.service.js), so the score column has to keep up: the Orbo
// number stays Orbo's color, and a closed-without-a-score review says "Reviewed", not "Pending".
describe("ReportCard — Orbo's number vs the analyst's verdict", () => {
  // Orbo says 91 (safe); the analyst confirmed it malicious, so the server sends kind:"dangerous".
  const overridden = {
    ...baseReport,
    ai_score: 91,
    kind: "dangerous",
    review: { human_score: 8, review_status: "confirmed malicious", reviewed_by: "Priya S." },
  };

  it("the badge shows the analyst's verdict while the Orbo number keeps Orbo's own color", () => {
    render(<ReportCard report={overridden} showReviewStatus={true} onOpen={() => {}} />);
    // The badge (from report.kind) is the analyst's verdict.
    expect(screen.getByText("Dangerous")).toBeInTheDocument();
    // Orbo's 91 is colored SAFE — painting it red would hide that the two verdicts disagree.
    const orboNumber = screen.getByText("91");
    expect(orboNumber).toHaveStyle({ color: "var(--safe)" });
  });

  it("a review CLOSED with no score typed reads 'Reviewed', not 'Pending'", () => {
    const closedNoScore = {
      ...overridden,
      review: { human_score: null, review_status: "confirmed malicious", reviewed_by: "Priya S." },
    };
    render(<ReportCard report={closedNoScore} showReviewStatus={true} onOpen={() => {}} />);
    // The bug: "Pending · Scored by Orbo (AI)" under a badge already saying Dangerous.
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.getByText("Reviewed")).toBeInTheDocument();
    expect(screen.getByText(/Closed by Priya S\./)).toBeInTheDocument();
  });

  it("a genuinely un-reviewed item still reads 'Pending' (work-in-progress is not a verdict)", () => {
    const stillWorking = {
      ...baseReport,
      review: { human_score: null, review_status: "investigating", reviewed_by: "Priya S." },
    };
    render(<ReportCard report={stillWorking} showReviewStatus={true} onOpen={() => {}} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });
});
