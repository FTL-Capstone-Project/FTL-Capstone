// ============================================================
// Tests for the Reports page ("My checks" / "Team History").
//
// Reports adapts to the signed-in role and fetches history from the backend.
// We mock:
//   - @clerk/clerk-react useAuth  → getToken (no real Clerk)
//   - ../../lib/useOrbisRole      → control individual vs member
//   - ../../lib/api               → canned GET /api/history responses
// Then we assert filtering, the member-only Team toggle + lazy org fetch, and
// the empty states.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Reports from "./Reports.jsx";

// Stable getToken reference: Reports has useEffect(..., [getToken]), so returning
// a NEW function each render would refire the effect forever (infinite re-render).
// Define it INSIDE the factory (vi.mock is hoisted above module code).
vi.mock("@clerk/clerk-react", () => {
  const getToken = async () => "test-token";
  return { useAuth: () => ({ getToken }) };
});

// Controllable role hook — each test sets the role before rendering.
vi.mock("../../lib/useOrbisRole.js", () => ({
  useOrbisRole: vi.fn(),
}));
import { useOrbisRole } from "../../lib/useOrbisRole.js";

vi.mock("../../lib/api.js", () => ({
  api: { get: vi.fn() },
}));
import { api } from "../../lib/api.js";

// Two "my checks" rows with different verdict kinds so we can test the filter.
const mineRows = [
  { indicator_id: 1, title: "Safe site", kind: "safe", ai_score: 91, tags: [], review: null },
  { indicator_id: 2, title: "Sketchy site", kind: "review", ai_score: 54, tags: [], review: null },
  { indicator_id: 3, title: "Scam site", kind: "dangerous", ai_score: 12, tags: [], review: null },
];

const setRole = (role) => useOrbisRole.mockReturnValue({ role, orgId: role === "individual" ? null : 1 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Reports page", () => {
  it("loads my checks on mount and renders each card", async () => {
    setRole("individual");
    api.get.mockResolvedValue({ reports: mineRows });

    render(<Reports />);

    await waitFor(() => expect(screen.getByText("Safe site")).toBeInTheDocument());
    expect(screen.getByText("Sketchy site")).toBeInTheDocument();
    expect(screen.getByText("Scam site")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/api/history?mine=1", expect.any(Object));
  });

  it("filters by verdict kind when a pill is clicked ('Suspicious' → kind 'review')", async () => {
    const user = userEvent.setup();
    setRole("individual");
    api.get.mockResolvedValue({ reports: mineRows });

    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Safe site")).toBeInTheDocument());

    // Click the "Suspicious" pill — only the kind === "review" card should remain.
    await user.click(screen.getByRole("button", { name: "Suspicious" }));
    expect(screen.getByText("Sketchy site")).toBeInTheDocument();
    expect(screen.queryByText("Safe site")).not.toBeInTheDocument();
    expect(screen.queryByText("Scam site")).not.toBeInTheDocument();
  });

  it("shows the 'none match this filter' empty state", async () => {
    const user = userEvent.setup();
    setRole("individual");
    // Only a safe row exists, so filtering to Dangerous yields nothing.
    api.get.mockResolvedValue({ reports: [mineRows[0]] });

    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Safe site")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Dangerous" }));
    expect(screen.getByText("No dangerous reports.")).toBeInTheDocument();
  });

  it("shows the 'no checks yet' empty state when there are no reports", async () => {
    setRole("individual");
    api.get.mockResolvedValue({ reports: [] });

    render(<Reports />);
    await waitFor(() =>
      expect(screen.getByText(/No checks yet/)).toBeInTheDocument()
    );
  });

  it("hides the Team History toggle for individuals", async () => {
    setRole("individual");
    api.get.mockResolvedValue({ reports: mineRows });

    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Safe site")).toBeInTheDocument());
    // The toggle labels come from HistoryScopeToggle (member-only).
    expect(screen.queryByText("Team History")).not.toBeInTheDocument();
  });

  it("shows the toggle for members and lazily fetches org history when Team is opened", async () => {
    const user = userEvent.setup();
    setRole("member");
    // Return mine on the first call; org rows on the second (team) call.
    api.get.mockImplementation((path) => {
      if (path.includes("org=1")) {
        return Promise.resolve({ reports: [{ indicator_id: 9, title: "Org scam", kind: "dangerous", tags: [], review: null }] });
      }
      return Promise.resolve({ reports: mineRows });
    });

    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Safe site")).toBeInTheDocument());

    // The org endpoint must NOT have been called until the Team tab is opened.
    expect(api.get).not.toHaveBeenCalledWith("/api/history?org=1", expect.any(Object));

    // Open the Team tab (HistoryScopeToggle renders a "Team History" control).
    await user.click(screen.getByText("Team History"));

    await waitFor(() => expect(screen.getByText("Org scam")).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith("/api/history?org=1", expect.any(Object));
  });
});
