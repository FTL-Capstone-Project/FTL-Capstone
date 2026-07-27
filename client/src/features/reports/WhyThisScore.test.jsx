// ── feature: reports · owner: Ozias ──
// The "Why this score" panel replaced "Threat vectors", which had three defects the user hit:
// threats mixed with reassurances under a threat heading, a bar whose length was one of three
// constants, and severity carried by COLOR ALONE (our amber↔green is ΔE ~7.7 for a protan reader).
// These tests lock the fixes:
//   • concerns and reassurances are SEPARATE, LABELED groups (the non-color encoding)
//   • the cost chip appears only where we actually know the weight — never invented
//   • reassurances start collapsed so the concerns are what you see first
//   • nothing to explain → renders nothing (so the modal's loading/error states still show)
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { default: WhyThisScore } = await import("./WhyThisScore.jsx");

const rows = [
  { text: "Asks you to enter or confirm a password", severity: "dangerous", weight: 35 },
  { text: "Uses urgency or threats to rush you", severity: "review", weight: 6 },
  { text: "The page design looks hastily made", severity: "review" },   // model prose — no weight
  { text: "Sender's domain matches the real company", severity: "safe" },
];

describe("WhyThisScore — the two-group split", () => {
  it("puts concerns and reassurances under their own labeled headings", () => {
    render(<WhyThisScore evidence={rows} />);
    // 3 non-safe rows, 1 safe row — the counts are in the headings, so a colorblind reader can
    // tell the groups apart without seeing a single dot.
    expect(screen.getByText(/what raised concern \(3\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /what checked out \(1\)/i })).toBeInTheDocument();
  });

  it("keeps the server's worst-first order instead of re-sorting", () => {
    render(<WhyThisScore evidence={rows} />);
    const concerns = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(concerns[0]).toMatch(/password/i);
    expect(concerns[1]).toMatch(/urgency/i);
  });
});

describe("WhyThisScore — honest costs only", () => {
  it("shows what a signal cost when we know the weight", () => {
    render(<WhyThisScore evidence={rows} />);
    expect(screen.getByText("−35 pts")).toBeInTheDocument();
    expect(screen.getByText("−6 pts")).toBeInTheDocument();
  });

  it("shows NO cost on a row we have no weight for (never a fabricated number)", () => {
    render(<WhyThisScore evidence={[{ text: "The page design looks hastily made", severity: "review" }]} />);
    expect(screen.getByText(/hastily made/i)).toBeInTheDocument();
    expect(screen.queryByText(/pts$/)).not.toBeInTheDocument();
  });

  it("ignores a zero/negative weight rather than printing '−0 pts'", () => {
    render(<WhyThisScore evidence={[{ text: "Something odd", severity: "review", weight: 0 }]} />);
    expect(screen.queryByText(/pts$/)).not.toBeInTheDocument();
  });

  it("shows NO cost on a reassurance row, even when it still carries a weight", () => {
    // This is the real shape of Ozias's 91-scoring email: the two soft rows (urgency, generic
    // greeting) were scored at 6 and 3, then clamped to "safe" because the final score landed in the
    // safe band. A "−6 pts" chip under the heading "What checked out" contradicts the heading.
    // All-safe rows → the group is already open (it's the whole story), so no click needed.
    render(<WhyThisScore evidence={[{ text: "Uses urgency to rush you", severity: "safe", weight: 6 }]} />);
    expect(screen.getByText(/uses urgency/i)).toBeInTheDocument();
    expect(screen.queryByText(/pts$/)).not.toBeInTheDocument();
  });
});

describe("WhyThisScore — the reassurance collapse", () => {
  it("starts collapsed when there ARE concerns, so the problems lead", () => {
    render(<WhyThisScore evidence={rows} />);
    const toggle = screen.getByRole("button", { name: /what checked out/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/domain matches the real company/i)).not.toBeInTheDocument();
  });

  it("expands on click and reveals the reassurances", async () => {
    const user = userEvent.setup();
    render(<WhyThisScore evidence={rows} />);
    await user.click(screen.getByRole("button", { name: /what checked out/i }));
    expect(screen.getByRole("button", { name: /what checked out/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/domain matches the real company/i)).toBeInTheDocument();
  });

  it("starts OPEN on a clean report, where the reassurances are the whole story", () => {
    render(<WhyThisScore evidence={[{ text: "No obvious red flags found in the sandbox", severity: "safe" }]} />);
    expect(screen.getByRole("button", { name: /what checked out/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/no obvious red flags/i)).toBeInTheDocument();
  });

  it("uses a real <button> for the toggle, so the modal's focus trap can see it", () => {
    // <details>/<summary>would fall outside ReportDetailModal's Tab trap, which queries for
    // button/[href]/input/select/textarea only — keyboard users could tab behind the overlay.
    render(<WhyThisScore evidence={rows} />);
    expect(screen.getByRole("button", { name: /what checked out/i }).tagName).toBe("BUTTON");
  });
});

describe("WhyThisScore — what to do", () => {
  it("renders the server's advice as an ordered list", () => {
    render(<WhyThisScore evidence={rows} nextSteps={["Don't click the link or reply.", "Delete it."]} />);
    expect(screen.getByText(/what to do/i)).toBeInTheDocument();
    expect(screen.getByText(/don't click the link/i)).toBeInTheDocument();
  });

  it("hides the section entirely when the server sent no advice", () => {
    render(<WhyThisScore evidence={rows} />);
    expect(screen.queryByText(/what to do/i)).not.toBeInTheDocument();
  });
});

describe("WhyThisScore — nothing to explain", () => {
  it("renders nothing at all with no evidence and no steps", () => {
    const { container } = render(<WhyThisScore />);
    expect(container).toBeEmptyDOMElement();
  });

  it("survives a non-array evidence value from an older row", () => {
    const { container } = render(<WhyThisScore evidence={null} nextSteps={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("drops rows with no text instead of rendering an empty bullet", () => {
    render(<WhyThisScore evidence={[{ severity: "review" }, { text: "Real row", severity: "review" }]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
