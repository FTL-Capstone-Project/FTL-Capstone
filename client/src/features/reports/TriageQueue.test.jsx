// ── analyst triage queue · component test · owner: Ozias ── (card G1·05)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiGet = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { get: (...a) => apiGet(...a) } }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ getToken: async () => "t" }) }));
// Keep the test focused on the queue: stub the detail modal to a marker.
vi.mock("./ReportDetailModal.jsx", () => ({ default: () => <div data-testid="modal" /> }));

const { default: TriageQueue } = await import("./TriageQueue.jsx");

// Four org reports across review states, in arbitrary source order so the sort has work to do.
const rows = [
  { indicator_id: 1, title: "HR benefits (safe)",   ai_score: 94, created_at: "2026-07-05", review: { review_status: "confirmed safe", human_score: 94 } },
  { indicator_id: 2, title: "FedEx (pending)",      ai_score: 54, created_at: "2026-07-06", review: { review_status: "pending review" } },
  { indicator_id: 3, title: "PayPal (confirmed)",   ai_score: 22, created_at: "2026-07-08", review: { review_status: "confirmed malicious", human_score: 18 } },
  { indicator_id: 4, title: "Microsoft (investigating)", ai_score: 31, created_at: "2026-07-07", review: { review_status: "investigating" } },
];

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockResolvedValue({ reports: rows });
});

// Read the rendered report titles top-to-bottom (headings inside ReportCard).
const renderedTitles = () =>
  screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("TriageQueue", () => {
  it("requests the analyst org queue (org=1&all=1)", async () => {
    render(<TriageQueue />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/history?org=1&all=1", expect.any(Object)));
  });

  it("priority-orders: open items first, most dangerous first, within groups", async () => {
    render(<TriageQueue />);
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    // Open group first (Microsoft score 31 before FedEx score 54 — more dangerous first),
    // then confirmed group (PayPal 22 before HR 94).
    expect(renderedTitles()).toEqual([
      "Microsoft (investigating)",
      "FedEx (pending)",
      "PayPal (confirmed)",
      "HR benefits (safe)",
    ]);
  });

  it("the pending filter narrows the list to just open items", async () => {
    const user = userEvent.setup();
    render(<TriageQueue />);
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    await user.click(screen.getByRole("button", { name: /pending review/i }));

    // Only the two open items remain, still priority-ordered.
    expect(renderedTitles()).toEqual(["Microsoft (investigating)", "FedEx (pending)"]);
  });
});
