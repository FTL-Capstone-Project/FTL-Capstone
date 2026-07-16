// ============================================================
// Tests for one report row (ReportCard).
//
// ReportCard is presentational. It renders a report from GET /api/history and,
// for org members (showReviewStatus), a second "ANALYST SCORE" block. The card
// title is a real button that calls onOpen. We assert what each persona sees and
// that the click handler fires.
// ============================================================
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportCard from "./ReportCard.jsx";

// A minimal report row in the shape GET /api/history returns.
const baseReport = {
  indicator_id: 1,
  title: "PayPal login page",
  url: "https://paypal.com",
  description: "A cloned PayPal sign-in page asking for your password.",
  tags: ["phishing", "credential-theft"],
  reported_by: "Anya K.",
  created_at: "2026-07-14T23:03:28.535Z",
  kind: "dangerous",
  ai_score: 22,
  screenshot_url: null,
  review: null,
};

describe("ReportCard", () => {
  it("renders the title, description, and tags", () => {
    render(<ReportCard report={baseReport} onOpen={() => {}} />);
    expect(screen.getByText("PayPal login page")).toBeInTheDocument();
    expect(screen.getByText(/cloned PayPal sign-in page/)).toBeInTheDocument();
    expect(screen.getByText("phishing")).toBeInTheDocument();
    expect(screen.getByText("credential-theft")).toBeInTheDocument();
  });

  it("falls back to the url when there is no title", () => {
    render(<ReportCard report={{ ...baseReport, title: null }} onOpen={() => {}} />);
    expect(screen.getByText("https://paypal.com")).toBeInTheDocument();
  });

  it("shows a single 'SAFETY SCORE' for individuals (showReviewStatus off)", () => {
    render(<ReportCard report={baseReport} onOpen={() => {}} />);
    expect(screen.getByText("SAFETY SCORE")).toBeInTheDocument();
    expect(screen.queryByText("ORBO SCORE")).not.toBeInTheDocument();
    expect(screen.queryByText("ANALYST SCORE")).not.toBeInTheDocument();
  });

  it("shows 'ORBO SCORE' + a 'Pending' analyst block for members when unscored", () => {
    const report = { ...baseReport, review: { human_score: null, reviewed_by: null } };
    render(<ReportCard report={report} showReviewStatus onOpen={() => {}} />);
    expect(screen.getByText("ORBO SCORE")).toBeInTheDocument();
    expect(screen.getByText("ANALYST SCORE")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Scored by Orbo (AI)")).toBeInTheDocument();
  });

  it("shows the analyst's human score and name when the review is scored", () => {
    const report = { ...baseReport, review: { human_score: 10, reviewed_by: "Priya S." } };
    render(<ReportCard report={report} showReviewStatus onOpen={() => {}} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Scored by Priya S.")).toBeInTheDocument();
  });

  it("calls onOpen when the title button is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ReportCard report={baseReport} onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: "PayPal login page" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows a dash for a missing ai_score", () => {
    render(<ReportCard report={{ ...baseReport, ai_score: null }} onOpen={() => {}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
