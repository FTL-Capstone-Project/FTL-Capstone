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
