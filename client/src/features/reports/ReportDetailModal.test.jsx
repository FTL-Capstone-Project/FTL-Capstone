// ── closure loop (analyst verdict form) · tests · owner: Ozias ──
// Covers the analyst verdict-authoring form in the Report detail modal (card G1·02):
//   • analyst sees the form, fills it, submits → PATCH /api/indicators/:id/review with the right body
//   • non-analyst (member/individual) does NOT see the form
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the API module the modal imports. get() backs the on-open detail fetch;
// patch() is the review submit we assert on.
const apiGet = vi.fn();
const apiPatch = vi.fn();
vi.mock("../../lib/api.js", () => ({
  api: {
    get: (...a) => apiGet(...a),
    patch: (...a) => apiPatch(...a),
  },
}));

// Clerk's useAuth just needs to hand back a getToken fn in tests.
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: async () => "test-token" }),
}));

const { default: ReportDetailModal } = await import("./ReportDetailModal.jsx");

// A minimal report list-row like Reports.jsx passes to the modal.
const report = {
  indicator_id: 10,
  title: "Fake PayPal 'account locked' email",
  url: "paypal-secure-login.xyz",
  ai_score: 22,
  description: "Impersonates PayPal to steal logins.",
  review: null,
};

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  // Detail fetch resolves with no existing review (fresh indicator).
  apiGet.mockResolvedValue({ status: "done", ai_score: 22, evidence: [], review: null });
  apiPatch.mockResolvedValue({ orgReview: { reviewStatus: "confirmed malicious" }, notified: 1 });
});

describe("ReportDetailModal — analyst verdict form", () => {
  it("does NOT render the form for a non-analyst (member)", async () => {
    render(<ReportDetailModal report={report} isMember={true} isAnalyst={false} onClose={() => {}} />);
    // Let the mount fetch settle so we're not asserting mid-render.
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByText("Analyst Review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit review/i })).not.toBeInTheDocument();
  });

  it("renders the form for an analyst and submits the right body to PATCH /review", async () => {
    const user = userEvent.setup();
    render(<ReportDetailModal report={report} isMember={true} isAnalyst={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    // The form is visible.
    expect(screen.getByText("Analyst Review")).toBeInTheDocument();

    // Fill it out: notes, score, status, share toggle.
    await user.type(screen.getByLabelText("Analysis notes"), "Verified phishing campaign.");
    await user.clear(screen.getByLabelText(/your score/i));
    await user.type(screen.getByLabelText(/your score/i), "18");
    await user.selectOptions(screen.getByLabelText("Review status"), "confirmed malicious");
    await user.click(screen.getByRole("checkbox"));

    await user.click(screen.getByRole("button", { name: /submit review/i }));

    // Asserts the endpoint + body shape the backend route expects.
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    const [path, body] = apiPatch.mock.calls[0];
    expect(path).toBe("/api/indicators/10/review");
    expect(body).toEqual({
      humanScore: 18,
      humanVerdict: "Verified phishing campaign.",
      reviewStatus: "confirmed malicious",
      sharedWithOrg: true,
    });
  });

  it("rejects an out-of-range score without calling the API", async () => {
    const user = userEvent.setup();
    render(<ReportDetailModal report={report} isMember={true} isAnalyst={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/your score/i), "150"); // > 100
    await user.click(screen.getByRole("button", { name: /submit review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/between 0 and 100/i);
    expect(apiPatch).not.toHaveBeenCalled();
  });
});

// The closure loop's payoff: an analyst writes an authoritative verdict, and the person who
// reported the link SEES it — signed and dated. Before this, `human_verdict` was saved to the
// DB and read back only to prefill the analyst's own form; the reporter never saw a word of it,
// and the header badge still showed Orbo's guess even after a human overruled it.
describe("ReportDetailModal — the analyst's verdict is visible and authoritative", () => {
  // Orbo called this SAFE (91); an analyst then confirmed it malicious with a score of 8.
  const overriddenReport = {
    indicator_id: 11,
    title: "Vendor invoice update",
    url: "vendor-invoices.example",
    ai_score: 91,
    description: "Looks like a routine invoice notice.",
    review: {
      human_score: 8,
      human_verdict: "Sender domain registered 3 days ago. Confirmed BEC attempt.",
      review_status: "confirmed malicious",
      reviewed_by: "Priya S.",
      reviewed_at: "2026-07-08T10:00:00.000Z",
    },
  };

  it("renders the analyst's notes, name and date (previously saved but never shown)", async () => {
    apiGet.mockResolvedValue({
      status: "done", ai_score: 91, evidence: [], review: overriddenReport.review,
    });
    render(<ReportDetailModal report={overriddenReport} isMember={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    // Scope to the verdict block: "Priya S." also appears in the Analyst score card's
    // "Scored by" line, so an unscoped query legitimately matches twice.
    const block = screen.getByRole("region", { name: "Analyst verdict" });
    expect(block).toHaveTextContent(/Confirmed BEC attempt/);
    expect(block).toHaveTextContent("Priya S.");
    expect(block).toHaveTextContent(/Jul 8, 2026/);
    // The closure status is spelled out, not left as color alone.
    expect(block).toHaveTextContent("Confirmed malicious");
  });

  it("the HEADER badge follows the analyst, not Orbo (regression: green 'Safe' on confirmed-malicious)", async () => {
    apiGet.mockResolvedValue({
      status: "done", ai_score: 91, evidence: [], review: overriddenReport.review,
    });
    render(<ReportDetailModal report={overriddenReport} isMember={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    // The heading carries the verdict badge. Orbo said 91/safe; the analyst says dangerous.
    const heading = screen.getByRole("heading", { name: /Vendor invoice update/ });
    expect(heading).toHaveTextContent("Dangerous");
    expect(heading).not.toHaveTextContent("Safe");
    // ...and the disagreement is explained rather than left as two clashing verdicts.
    expect(screen.getByText(/overrides Orbo's automated score/i)).toBeInTheDocument();
  });

  it("a confirmed status with no score typed still counts as the verdict", async () => {
    const statusOnly = {
      ...overriddenReport,
      review: { human_score: null, human_verdict: null, review_status: "confirmed malicious",
        reviewed_by: "Priya S.", reviewed_at: "2026-07-08T10:00:00.000Z" },
    };
    apiGet.mockResolvedValue({ status: "done", ai_score: 91, evidence: [], review: statusOnly.review });
    render(<ReportDetailModal report={statusOnly} isMember={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    expect(screen.getByRole("heading", { name: /Vendor invoice update/ })).toHaveTextContent("Dangerous");
  });

  it("work-in-progress review → NO verdict block, and Orbo's verdict still stands", async () => {
    // Opening a triage ticket is not a conclusion. If this overrode, merely starting to
    // investigate would blank out the only verdict the reporter has.
    const pending = {
      ...overriddenReport,
      review: { human_score: null, human_verdict: null, review_status: "investigating",
        reviewed_by: "Priya S.", reviewed_at: "2026-07-08T10:00:00.000Z" },
    };
    apiGet.mockResolvedValue({ status: "done", ai_score: 91, evidence: [], review: pending.review });
    render(<ReportDetailModal report={pending} isMember={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    expect(screen.queryByRole("region", { name: "Analyst verdict" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Vendor invoice update/ })).toHaveTextContent("Safe");
  });

  it("a review CLOSED with no score typed doesn't claim we're still 'awaiting' the analyst", async () => {
    const closedNoScore = {
      ...overriddenReport,
      review: { human_score: null, human_verdict: "Confirmed by hand.", review_status: "confirmed malicious",
        reviewed_by: "Priya S.", reviewed_at: "2026-07-08T10:00:00.000Z" },
    };
    apiGet.mockResolvedValue({ status: "done", ai_score: 91, evidence: [], review: closedNoScore.review });
    render(<ReportDetailModal report={closedNoScore} isMember={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    expect(screen.queryByText("Awaiting analyst review")).not.toBeInTheDocument();
    expect(screen.getByText(/Closed by Priya S\./)).toBeInTheDocument();
  });

  it("still says 'Awaiting analyst review' when nobody has actually decided", async () => {
    const pending = {
      ...overriddenReport,
      review: { human_score: null, human_verdict: null, review_status: "pending review",
        reviewed_by: null, reviewed_at: null },
    };
    apiGet.mockResolvedValue({ status: "done", ai_score: 91, evidence: [], review: pending.review });
    render(<ReportDetailModal report={pending} isMember={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    expect(screen.getByText("Awaiting analyst review")).toBeInTheDocument();
  });

  it("individual with no review at all → no verdict block, badge is Orbo's", async () => {
    render(<ReportDetailModal report={report} isMember={false} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    expect(screen.queryByRole("region", { name: "Analyst verdict" })).not.toBeInTheDocument();
    // report.ai_score is 22 → dangerous, straight from Orbo.
    expect(screen.getByRole("heading", { name: /Fake PayPal/ })).toHaveTextContent("Dangerous");
  });
});

// An email score is a worst-of across three legs (sender trust / message wording / link scans), so the
// combined number alone doesn't say what caused it. Analysts need the decomposition before writing an
// authoritative verdict; regular users don't (it's plumbing, and it isn't actionable for them).
describe("ReportDetailModal — per-leg score breakdown (analysts only)", () => {
  const emailReport = { indicator_id: 12, title: "Forwarded email", url: "mail", ai_score: 63, review: null };
  const withLegs = { status: "done", ai_score: 63, evidence: [], review: null,
    legs: { sender: 70, body: 63, link: null } };

  it("shows the breakdown to an analyst, with 'n/a' for a leg that didn't run", async () => {
    apiGet.mockResolvedValue(withLegs);
    render(<ReportDetailModal report={emailReport} isMember={true} isAnalyst={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const line = screen.getByText(/Score breakdown/).closest("p");
    expect(line).toHaveTextContent("sender 70");
    expect(line).toHaveTextContent("message 63");
    expect(line).toHaveTextContent("links n/a"); // the email had no links — not "0", which reads as danger
  });

  it("does NOT show it to a non-analyst member", async () => {
    apiGet.mockResolvedValue(withLegs);
    render(<ReportDetailModal report={emailReport} isMember={true} isAnalyst={false} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    expect(screen.queryByText(/Score breakdown/)).not.toBeInTheDocument();
  });

  it("a URL check (no legs) shows nothing, even for an analyst", async () => {
    apiGet.mockResolvedValue({ status: "done", ai_score: 63, evidence: [], review: null, legs: null });
    render(<ReportDetailModal report={emailReport} isMember={true} isAnalyst={true} onClose={() => {}} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    expect(screen.queryByText(/Score breakdown/)).not.toBeInTheDocument();
  });
});
