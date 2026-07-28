// ── feature: dashboard · role-router test · owner: Michael ──
// Dashboard.jsx routes by role:
//   analyst    → AnalystDashboard (org-wide, Recharts charts)
//   individual → personal Dashboard (hand-built SVG/CSS charts)
//   member     → MemberDashboard (personal + team situational awareness)
// This test asserts the branching and that each variant receives the right data.
// Each variant's charts are tested in their own file; here we focus on the router
// + data-fetch contract.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Role is injected per-test by setting the mocked hook's return value.
const mockRole = vi.fn();
vi.mock("../../lib/useOrbisRole.js", () => ({ useOrbisRole: () => mockRole() }));

// Stable getToken (must be the same reference to avoid effect-loop re-renders).
vi.mock("@clerk/clerk-react", () => {
  const getToken = async () => "test-token";
  return { useAuth: () => ({ getToken }), useOrganization: () => ({}), useUser: () => ({ user: null }) };
});

// api.get backs both /api/dashboard (personal + member) and /api/history (analyst).
// api.post backs the Ask Orbo data-query rail (/api/nlp-query) on member + analyst dashboards.
const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a) } }));

// Stub Recharts so JSDOM doesn't need a real SVG engine.
vi.mock("recharts", () => ({
  BarChart: ({ children }) => <div data-testid="barchart">{children}</div>,
  Bar: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div data-testid="piechart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  LabelList: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

const { default: Dashboard } = await import("./Dashboard.jsx");

// ── Analyst stats payload (shape from the /api/history stats branch) ────────
const ANALYST_STATS = {
  stats: {
    verdictBreakdown: { safe: 4, review: 2, dangerous: 1, total: 7 },
    trend: [
      { date: "2026-07-15", count: 3 },
      { date: "2026-07-16", count: 4 },
    ],
    pendingCount: 3,
    oldestPendingDays: 4,
    threatsThisWeek: { value: 1, trend: { pct: 0, direction: "flat" } },
    reviewedThisWeek: { value: 2, trend: { pct: 50, direction: "up" } },
    aiAgreement: { pct: 80, sample: 5 },
    scoreCalibration: { avgDelta: -4, sample: 5 },
    avgTurnaroundDays: 2,
    sharedRate: { pct: 60, shared: 3, closed: 5 },
    topTargeted: [{ domain: "paypa1.com", count: 1 }],
    threatTypes: [{ label: "Credential phishing", count: 2 }],
    confidenceMix: { high: 3, medium: 2, low: 1, unknown: 1 },
    topReporters: [{ name: "Anya K.", count: 4 }, { name: "Marcus T.", count: 2 }],
    redFlags: { knownBad: 1, redirect: 0, newDomain: 2 },
    channels: { web: 5, email: 2 },
  },
  recent: [
    { indicatorId: 10, title: "Fake PayPal login", domain: "paypa1.com", score: 18, kind: "dangerous", reporter: "Anya K.", screenshotUrl: null, reviewStatus: "confirmed malicious", createdAt: "2026-07-15T10:00:00Z" },
    { indicatorId: 11, title: "HR benefits email",  domain: "acme.com",  score: 91, kind: "safe",      reporter: "Marcus T.", screenshotUrl: null, reviewStatus: "pending review",      createdAt: "2026-07-14T08:00:00Z" },
  ],
  activity: [
    { kind: "submission", label: "Reported by Anya K.", subject: "Fake PayPal login", at: "2026-07-15T10:00:00Z" },
  ],
};

// ── Personal stats payload (shape from GET /api/dashboard) ─────────────────
const PERSONAL_STATS = {
  stats: {
    checksThisWeek: { value: 5, trend: { pct: 10, direction: "up" } },
    threatsFound:   { value: 1, trend: { pct: 0,  direction: "flat" } },
    safeRate: 67,
    topThreatType: "Credential phishing",
  },
  submissionHistory: [{ date: "2026-07-15", count: 2 }],
  results: { safe: 4, suspicious: 1, dangerous: 1, total: 6 },
  recentSubmissions: [],
  activity: [],
  threatTypes: [{ label: "Credential phishing", count: 1 }],
  redFlags: { knownBad: 0, redirect: 1, newDomain: 0 },
  channels: { web: 5, email: 1 },
};

// ── Member payload = personal + a team block (server attaches `team`) ───────
const MEMBER_STATS = {
  ...PERSONAL_STATS,
  team: {
    stats: { teamThreatsThisWeek: 3, teamReportsThisWeek: 12, activeCampaigns: 1, teamTotalChecks: 20 },
    threatTypes: [{ label: "Credential phishing", count: 4 }],
    recentlyConfirmed: [],
  },
};

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  // The rail fires a query only on user submit, but default to a benign resolved value so a
  // stray call never rejects mid-test.
  apiPost.mockResolvedValue({ fallback: "ok" });
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
    // "AI Agreement" is a new analyst-only tile; "Pending Review" appears as both a
    // stat tile label and a card heading.
    expect(screen.getByText("AI Agreement")).toBeInTheDocument();
    expect(screen.getAllByText("Pending Review").length).toBeGreaterThanOrEqual(1);
    // New analyst analytics cards + the shared right rail (relabeled "Team Activity").
    expect(screen.getByText("Review Insights")).toBeInTheDocument();
    expect(screen.getByText("AI Confidence Mix")).toBeInTheDocument();
    expect(screen.getByText("Top Reporters")).toBeInTheDocument();
    expect(screen.getByText("Team Activity")).toBeInTheDocument();
    // Charts are stubbed; assert placeholders rendered. The analyst now has several
    // bar charts (trend + threat-types + top-targeted), so allow one-or-more.
    expect(screen.getAllByTestId("barchart").length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getByText("Safe Rate")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /analyst dashboard/i })).not.toBeInTheDocument();
    // Personal variant fetches /api/dashboard, not /api/history.
    expect(apiGet).toHaveBeenCalledWith("/api/dashboard", expect.anything());
    // Individuals have NO Ask Orbo data rail (no team data to query).
    expect(screen.queryByText("Ask Orbo")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask about your data/i)).not.toBeInTheDocument();
  });

  it("renders the member variant for role=member (team-aware, not analyst)", async () => {
    mockRole.mockReturnValue({ role: "member", orgName: "Acme" });
    apiGet.mockResolvedValue(MEMBER_STATS);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    // Member gets a team dashboard heading + a team-specific tile, and fetches
    // /api/dashboard (server attaches the `team` block).
    await waitFor(() => screen.getByText("Team Threats This Week"));
    expect(screen.queryByRole("heading", { name: /analyst dashboard/i })).not.toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/api/dashboard", expect.anything());
  });

  it("analyst variant shows pending-review items from recent[]", async () => {
    mockRole.mockReturnValue({ role: "analyst" });
    apiGet.mockResolvedValue(ANALYST_STATS);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    // "Fake PayPal login" now shows in BOTH the pending queue and the Team Activity
    // rail (its subject), so allow more than one match.
    await waitFor(() => screen.getAllByText("Fake PayPal login"));
    expect(screen.getAllByText("Fake PayPal login").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("HR benefits email")).toBeInTheDocument();
  });

  it("analyst empty states are accurate: checks exist but all safe → not 'nothing yet'", async () => {
    mockRole.mockReturnValue({ role: "analyst" });
    // An org that has run checks, but every one came back safe: risky/dangerous slices are
    // empty. The cards must say "all N were safe", NOT a misleading "No ... yet".
    apiGet.mockResolvedValue({
      stats: {
        verdictBreakdown: { safe: 5, review: 0, dangerous: 0, total: 5 },
        trend: [{ date: "2026-07-15", count: 2 }],
        pendingCount: 0,
        oldestPendingDays: 0,
        threatsThisWeek: { value: 0, trend: { pct: 0, direction: "flat" } },
        reviewedThisWeek: { value: 0, trend: { pct: 0, direction: "flat" } },
        aiAgreement: null,
        scoreCalibration: null,
        avgTurnaroundDays: null,
        sharedRate: null,
        topTargeted: [],   // no dangerous hosts
        threatTypes: [],   // no risky categories
        confidenceMix: { high: 5, medium: 0, low: 0, unknown: 0 },
        topReporters: [{ name: "Anya K.", count: 5 }],
        redFlags: {},
        channels: { web: 5, email: 0 },
      },
      recent: [],
      activity: [],
    });

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => screen.getByText("Threat Types"));
    // Accurate: names the safe checks instead of implying no activity.
    expect(screen.getByText(/all 5 checked links came back safe/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing your team checked landed on a flagged host/i)).toBeInTheDocument();
    // The old misleading copy must be gone.
    expect(screen.queryByText(/no risky submissions yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no dangerous links yet/i)).not.toBeInTheDocument();
  });

  it("member Ask Orbo rail queries /api/nlp-query and renders the prose answer + cards", async () => {
    mockRole.mockReturnValue({ role: "member", orgName: "Acme" });
    apiGet.mockResolvedValue(MEMBER_STATS);
    // The interactive engine returns LLM prose + embedded report cards (+ data/chartSpec for Insights).
    apiPost.mockResolvedValue({
      answer: "You had 1 dangerous link this week: a fake Microsoft 365 sign-in page scoring 8/100.",
      cards: [{ indicatorId: 7, title: "Fake MS365 login", domain: "ms365-verify.com", score: 8, verdict: "dangerous", reportedAt: "2026-07-26T08:00:00Z" }],
      data: [{ label: "Total", value: 1 }],
      chartSpec: { type: "count", title: "dangerous links this week" },
    });

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    // The rail is present for members.
    await waitFor(() => screen.getByPlaceholderText(/ask about your data/i));

    // Type a question and submit.
    const input = screen.getByPlaceholderText(/ask about your data/i);
    fireEvent.change(input, { target: { value: "how many dangerous links this week?" } });
    fireEvent.submit(input.closest("form"));

    // It hits the nlp-query endpoint (NOT a link checker) with the question.
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost.mock.calls[0][0]).toBe("/api/nlp-query");
    expect(apiPost.mock.calls[0][1]).toEqual({ question: "how many dangerous links this week?" });
    // Renders the LLM prose answer…
    await waitFor(() => screen.getByText(/fake microsoft 365 sign-in page scoring 8/i));
    // …and the embedded report card (a clickable link to the report).
    expect(screen.getByText("Fake MS365 login")).toBeInTheDocument();
  });
});
