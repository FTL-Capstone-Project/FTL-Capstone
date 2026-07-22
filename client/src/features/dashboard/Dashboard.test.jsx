// ── feature: dashboard · role-router test · owner: Michael ──
// Dashboard.jsx routes by role:
//   analyst    → AnalystDashboard (org-wide, Recharts charts)
//   individual → personal Dashboard (hand-built SVG/CSS charts)
//   member     → personal Dashboard (same as individual)
// This test asserts the branching and that the analyst + personal variants
// receive the right data. Each variant's charts are tested in their own file;
// here we focus on the router + data-fetch contract.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Role is injected per-test by setting the mocked hook's return value.
const mockRole = vi.fn();
vi.mock("../../lib/useOrbisRole.js", () => ({ useOrbisRole: () => mockRole() }));

// Stable getToken (must be the same reference to avoid effect-loop re-renders).
vi.mock("@clerk/clerk-react", () => {
  const getToken = async () => "test-token";
  return { useAuth: () => ({ getToken }), useOrganization: () => ({}), useUser: () => ({ user: null }) };
});

// api.get backs both /api/dashboard (personal) and /api/history (analyst).
const apiGet = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { get: (...a) => apiGet(...a) } }));

// Stub Recharts so JSDOM doesn't need a real SVG engine.
vi.mock("recharts", () => ({
  BarChart: ({ children }) => <div data-testid="barchart">{children}</div>,
  Bar: () => null,
  PieChart: ({ children }) => <div data-testid="piechart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

const { default: Dashboard } = await import("./Dashboard.jsx");

// ── Analyst stats payload (shape from G2·02) ────────────────────────────────
const ANALYST_STATS = {
  stats: {
    verdictBreakdown: { safe: 4, review: 2, dangerous: 1, total: 7 },
    trend: [
      { date: "2026-07-15", count: 3 },
      { date: "2026-07-16", count: 4 },
    ],
    pendingCount: 3,
  },
  recent: [
    { indicatorId: 10, title: "Fake PayPal login", domain: "paypa1.com", score: 18, kind: "dangerous", reporter: "Anya K.", createdAt: "2026-07-15T10:00:00Z" },
    { indicatorId: 11, title: "HR benefits email",  domain: "acme.com",  score: 91, kind: "safe",      reporter: "Marcus T.", createdAt: "2026-07-14T08:00:00Z" },
  ],
};

// ── Personal stats payload (shape from GET /api/dashboard) ─────────────────
const PERSONAL_STATS = {
  stats: {
    checksThisWeek: { value: 5, trend: { pct: 10, direction: "up" } },
    threatsFound:   { value: 1, trend: { pct: 0,  direction: "flat" } },
    safetyScore: 82,
    checksRemaining: { used: 5, limit: 50 },
  },
  submissionHistory: [{ date: "2026-07-15", count: 2 }],
  results: { safe: 4, suspicious: 1, dangerous: 1, total: 6 },
  recentSubmissions: [],
  activity: [],
};

beforeEach(() => {
  apiGet.mockReset();
});

describe("Dashboard role-router", () => {
  it("renders the analyst variant for role=analyst", async () => {
    mockRole.mockReturnValue({ role: "analyst" });
    apiGet.mockResolvedValue(ANALYST_STATS);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    // While loading, shows a loading message.
    expect(screen.getByText(/loading org dashboard/i)).toBeInTheDocument();

    // After fetch resolves, shows the analyst heading + stat tiles.
    await waitFor(() => screen.getByRole("heading", { name: /analyst dashboard/i }));
    expect(screen.getByText("Total Checks")).toBeInTheDocument();
    // "Pending Review" appears as both a stat tile label and a card heading.
    expect(screen.getAllByText("Pending Review").length).toBeGreaterThanOrEqual(1);
    // Charts are stubbed; assert placeholders rendered.
    expect(screen.getByTestId("barchart")).toBeInTheDocument();
    expect(screen.getByTestId("piechart")).toBeInTheDocument();
    // Fetch was called with /api/history (analyst endpoint).
    expect(apiGet).toHaveBeenCalledWith("/api/history", expect.anything());
  });

  it("renders the personal variant for role=individual", async () => {
    mockRole.mockReturnValue({ role: "individual" });
    apiGet.mockResolvedValue(PERSONAL_STATS);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => screen.getByRole("heading", { name: /my dashboard/i }));
    // Personal tiles, not analyst ones.
    expect(screen.getByText("My Checks This Week")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /analyst dashboard/i })).not.toBeInTheDocument();
    // Personal variant fetches /api/dashboard, not /api/history.
    expect(apiGet).toHaveBeenCalledWith("/api/dashboard", expect.anything());
  });

  it("renders the personal variant for role=member (member ≠ analyst)", async () => {
    mockRole.mockReturnValue({ role: "member" });
    apiGet.mockResolvedValue(PERSONAL_STATS);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => screen.getByRole("heading", { name: /my dashboard/i }));
    expect(screen.queryByRole("heading", { name: /analyst dashboard/i })).not.toBeInTheDocument();
  });

  it("analyst variant shows pending-review items from recent[]", async () => {
    mockRole.mockReturnValue({ role: "analyst" });
    apiGet.mockResolvedValue(ANALYST_STATS);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => screen.getByText("Fake PayPal login"));
    expect(screen.getByText("Fake PayPal login")).toBeInTheDocument();
    expect(screen.getByText("HR benefits email")).toBeInTheDocument();
  });
});
