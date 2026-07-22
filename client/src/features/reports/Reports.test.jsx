// ── reports page · role-router test · owner: Ozias ── (card G1·07)
// Reports.jsx is a ROUTER by role:
//   analyst    → TriageQueue (org-wide triage)
//   member     → "My checks" + Team History toggle (+ closure chips)
//   individual → "My checks" only, no toggle
// This test drives each role and asserts the right variant renders. The child
// components (TriageQueue, ReportDetailModal) have their own tests, so we stub them
// to markers and focus on Reports.jsx's own branching + the member scope toggle.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Role is injected per-test by setting the mocked hook's return value.
const mockRole = vi.fn();
vi.mock("../../lib/useOrbisRole.js", () => ({ useOrbisRole: () => mockRole() }));
// IMPORTANT: getToken must be a STABLE reference (defined once in the factory).
// MyChecks' effects depend on [getToken]; a new function each render would re-run
// them forever → render storm. (Same fix the NotificationsContext test uses.)
vi.mock("@clerk/clerk-react", () => {
  const getToken = async () => "test-token";
  return { useAuth: () => ({ getToken }) };
});

// api.get backs the ?mine=1 / ?org=1 fetches.
const apiGet = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { get: (...a) => apiGet(...a) } }));

// Stub the heavy children to simple markers (their behavior is tested elsewhere).
vi.mock("./TriageQueue.jsx", () => ({ default: () => <div data-testid="triage-queue" /> }));
vi.mock("./ReportDetailModal.jsx", () => ({ default: () => <div data-testid="modal" /> }));

const { default: Reports } = await import("./Reports.jsx");

// STABLE response references so a resolved fetch doesn't hand React a brand-new array
// every call (which, with the effect deps, could keep nudging state and re-rendering).
const mineRows = [
  { indicator_id: 1, title: "Dangerous link", kind: "dangerous", ai_score: 20 },
  { indicator_id: 2, title: "Safe link",      kind: "safe",      ai_score: 90 },
];
const teamRows = [{ indicator_id: 9, title: "Team link", kind: "dangerous" }];
const MINE_RESPONSE = { reports: mineRows };
const TEAM_RESPONSE = { reports: teamRows };

beforeEach(() => {
  apiGet.mockReset();
  mockRole.mockReset();
  // Route each history scope to its canned (stable) response.
  apiGet.mockImplementation((path) =>
    Promise.resolve(path.includes("org=1") ? TEAM_RESPONSE : MINE_RESPONSE)
  );
});

describe("Reports role-router", () => {
  it("analyst → renders the triage queue, not the personal list", async () => {
    mockRole.mockReturnValue({ role: "analyst" });
    render(<Reports />);
    expect(screen.getByTestId("triage-queue")).toBeInTheDocument();
    expect(screen.queryByText("My checks")).not.toBeInTheDocument();
    // The router returns TriageQueue before MyChecks' effects → no history fetch here.
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("individual → 'My checks', NO Team History toggle", async () => {
    mockRole.mockReturnValue({ role: "individual" });
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Dangerous link")).toBeInTheDocument());

    expect(screen.getByRole("heading", { name: "My checks" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /team history/i })).not.toBeInTheDocument();
    // Only ?mine=1 is fetched for an individual.
    expect(apiGet).toHaveBeenCalledWith("/api/history?mine=1", expect.any(Object));
  });

  it("member → shows the Team History toggle and switches datasets on click", async () => {
    mockRole.mockReturnValue({ role: "member" });
    const user = userEvent.setup();
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Dangerous link")).toBeInTheDocument());

    // Toggle present (member only).
    const teamTab = screen.getByRole("button", { name: /team history/i });
    expect(teamTab).toBeInTheDocument();

    // Switch to Team History → heading changes + the org dataset renders.
    await user.click(teamTab);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Team History" })).toBeInTheDocument());
    expect(screen.getByText("Team link")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/api/history?org=1", expect.any(Object));
  });

  it("individual → the verdict filter narrows the visible list", async () => {
    mockRole.mockReturnValue({ role: "individual" });
    const user = userEvent.setup();
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Dangerous link")).toBeInTheDocument());

    // Click the "Safe" pill → only the safe report remains.
    await user.click(screen.getByRole("button", { name: "Safe" }));
    expect(screen.getByText("Safe link")).toBeInTheDocument();
    expect(screen.queryByText("Dangerous link")).not.toBeInTheDocument();
  });

  it("empty-filter message uses the friendly label, not the raw kind", async () => {
    mockRole.mockReturnValue({ role: "individual" });
    const user = userEvent.setup();
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Dangerous link")).toBeInTheDocument());

    // The seed data has no "review"-kind rows, so selecting "Suspicious" empties the list.
    // The message must read "No suspicious reports." — the pill label — not "No review reports."
    await user.click(screen.getByRole("button", { name: "Suspicious" }));
    expect(screen.getByText(/no suspicious reports/i)).toBeInTheDocument();
    expect(screen.queryByText(/no review reports/i)).not.toBeInTheDocument();
  });

  it("individual → shows a Delete option on a card; member → does NOT (archive-only)", async () => {
    const user = userEvent.setup();

    // Individual: Delete is offered.
    mockRole.mockReturnValue({ role: "individual" });
    const { unmount } = render(<Reports />);
    await waitFor(() => expect(screen.getByText("Dangerous link")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: /report options/i })[0]);
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /archive/i })).toBeInTheDocument();
    unmount();

    // Member: same menu, but NO Delete (their report feeds the analyst queue → archive only).
    mockRole.mockReturnValue({ role: "member" });
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("Dangerous link")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: /report options/i })[0]);
    expect(screen.getByRole("menuitem", { name: /archive/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument();
  });
});
