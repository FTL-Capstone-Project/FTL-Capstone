// ── community "Mark safe" vote · component tests · owner: David ──
// Covers the VerdictCard button that was previously `disabled` with a "coming soon" tooltip:
//   • it only appears where vouching means something (review / dangerous, never safe)
//   • clicking POSTs to /api/indicators/:id/trust and flips to the "Marked safe" state
//   • it loads ALREADY voted when the server says so (no inviting a duplicate)
//   • a failure surfaces a message and leaves the button usable
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiPost = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { post: (...a) => apiPost(...a) } }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ getToken: async () => "test-token" }) }));
// Keep the test on the button: stub the children that fetch or draw.
vi.mock("./ScreenshotReader.jsx", () => ({ default: () => <div data-testid="shot-reader" /> }));
vi.mock("./ReportModal.jsx", () => ({ default: () => <div data-testid="report-modal" /> }));

const { default: VerdictCard } = await import("./VerdictCard.jsx");

// A scored indicator in the shape the chat hands the card. score drives the verdict bucket:
// >= 70 safe, >= 35 review, else dangerous.
const indicator = (overrides = {}) => ({
  ai_score: 22,                  // dangerous by default — the button should offer
  ai_verdict: "This looks like a credential-harvesting page.",
  ai_confidence: "high",
  screenshot_url: null,
  report_count: 1,
  evidence: [],
  indicator_id: 10,
  trust_votes: 0,
  trusted_by_me: false,
  ...overrides,
});

const markSafeButton = () => screen.queryByRole("button", { name: /mark(ed)? safe/i });

beforeEach(() => { apiPost.mockReset(); });

describe("VerdictCard — community Mark safe vote", () => {
  it("offers the vote on a DANGEROUS verdict", () => {
    render(<VerdictCard indicator={indicator({ ai_score: 12 })} />);
    expect(markSafeButton()).toBeEnabled();
  });

  it("offers the vote on a REVIEW verdict", () => {
    render(<VerdictCard indicator={indicator({ ai_score: 50 })} />);
    expect(markSafeButton()).toBeEnabled();
  });

  it("does NOT offer it on an already-SAFE verdict (nothing to vouch for)", () => {
    render(<VerdictCard indicator={indicator({ ai_score: 95 })} />);
    expect(markSafeButton()).toBeNull();
  });

  it("does NOT offer it when there's no persisted indicator to attach a vote to", () => {
    // Ephemeral reports (e.g. a sender check with no stored row) carry no id.
    render(<VerdictCard indicator={indicator({ indicator_id: null })} />);
    expect(markSafeButton()).toBeNull();
  });

  it("posts the vote and flips to the Marked safe state", async () => {
    apiPost.mockResolvedValue({ trust_votes: 1, already_voted: false });
    const user = userEvent.setup();
    render(<VerdictCard indicator={indicator()} />);

    await user.click(markSafeButton());

    expect(apiPost).toHaveBeenCalledWith("/api/indicators/10/trust", {}, expect.any(Object));
    await waitFor(() => expect(screen.getByRole("button", { name: /marked safe/i })).toBeDisabled());
    expect(screen.getByText(/thanks — noted/i)).toBeInTheDocument();
    // Be explicit that a vote is not a verdict change, so nobody reads it as "now safe".
    expect(screen.getByText(/doesn't change the verdict/i)).toBeInTheDocument();
  });

  it("uses the explicit indicatorId prop when given (link scans pass it separately)", async () => {
    apiPost.mockResolvedValue({ trust_votes: 1, already_voted: false });
    const user = userEvent.setup();
    render(<VerdictCard indicator={indicator({ indicator_id: null })} indicatorId={77} />);

    await user.click(markSafeButton());

    expect(apiPost).toHaveBeenCalledWith("/api/indicators/77/trust", {}, expect.any(Object));
  });

  it("renders already-voted from the server without inviting a duplicate", () => {
    render(<VerdictCard indicator={indicator({ trusted_by_me: true, trust_votes: 4 })} />);
    expect(screen.getByRole("button", { name: /marked safe/i })).toBeDisabled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("shows the community count once more than one person has vouched", () => {
    render(<VerdictCard indicator={indicator({ trust_votes: 4 })} />);
    expect(screen.getByText(/4 people have marked this safe/i)).toBeInTheDocument();
  });

  it("hides the count when only one person has vouched (nothing to aggregate)", () => {
    render(<VerdictCard indicator={indicator({ trust_votes: 1 })} />);
    expect(screen.queryByText(/people have marked this safe/i)).toBeNull();
  });

  it("a double-click can't double-post (the button disables while in flight)", async () => {
    apiPost.mockResolvedValue({ trust_votes: 1, already_voted: false });
    const user = userEvent.setup();
    render(<VerdictCard indicator={indicator()} />);

    const button = markSafeButton();
    await user.dblClick(button);

    await waitFor(() => expect(screen.getByRole("button", { name: /marked safe/i })).toBeDisabled());
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failure and leaves the button usable for a retry", async () => {
    apiPost.mockRejectedValue({ body: { error: "Couldn't record your vote just now." } });
    const user = userEvent.setup();
    render(<VerdictCard indicator={indicator()} />);

    await user.click(markSafeButton());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't record your vote/i));
    // Still "Mark safe" (not the voted state) and clickable again.
    expect(screen.getByRole("button", { name: /^mark safe$/i })).toBeEnabled();
  });
});
