// ── insights · chart variant rendering · component test · owner: Ozias ──
// Covers the 5 named report variants (heatmap, trend, campaigns table, score histogram, weekly
// report) plus the generic count path, by faking the POST /api/nlp-query response and asserting
// the right renderer ran.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiPost = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { post: (...a) => apiPost(...a) } }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ getToken: async () => "t" }) }));

// Stub Recharts so JSDOM doesn't need a real SVG engine (same approach as Dashboard.test.jsx).
// dataKey is exposed as text so a test can assert WHICH series were plotted.
vi.mock("recharts", () => ({
  BarChart: ({ children }) => <div data-testid="barchart">{children}</div>,
  Bar: ({ dataKey }) => <span>series:{dataKey}</span>,
  LineChart: ({ children }) => <div data-testid="linechart">{children}</div>,
  Line: ({ dataKey }) => <span>series:{dataKey}</span>,
  PieChart: ({ children }) => <div data-testid="piechart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

const { default: Insights } = await import("./Insights.jsx");

// Ask a question and wait for the answer to land.
const ask = async (result) => {
  apiPost.mockResolvedValue(result);
  render(<Insights />);
  const input = screen.getByPlaceholderText(/how many dangerous links/i);
  await userEvent.type(input, "a question");
  await userEvent.click(screen.getByLabelText("Ask"));
  await waitFor(() => expect(apiPost).toHaveBeenCalled());
};

// Braces matter: vitest treats a FUNCTION returned from beforeEach as a teardown callback, and
// `mockReset()` returns the mock itself — so `() => apiPost.mockReset()` would make vitest call
// apiPost() after every test and await the result (failing the rejection test on its own mock).
beforeEach(() => {
  apiPost.mockReset();
});

describe("Insights — named report variants", () => {
  it("renders the heatmap as a full day × slot grid with a Low→High legend", async () => {
    // 2 cells is enough — the component reads the grid shape from chartSpec, not from data length.
    await ask({
      data: [{ day: 0, slot: 0, value: 3 }, { day: 1, slot: 2, value: 0 }],
      chartSpec: {
        type: "heatmap", title: "Submission Activity Heatmap",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        slots: ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"],
        max: 3, subtitle: "Past 30 days · times shown in UTC",
      },
    });

    expect(await screen.findByText("Submission Activity Heatmap")).toBeTruthy();
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.getByText("9pm")).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    // The UTC caveat must be visible, not silently assumed.
    expect(screen.getByText(/UTC/)).toBeTruthy();
  });

  it("renders the trend as one line per attack type, with delta chips", async () => {
    await ask({
      data: [{ label: "Apr 6", "Credential phishing": 2, "SMS phishing": 1 }],
      chartSpec: {
        type: "trend", title: "90-Day Threat Trend by Attack Type",
        series: ["Credential phishing", "SMS phishing"],
        deltas: [
          { label: "Credential phishing", pct: 41, direction: "up" },
          { label: "SMS phishing", pct: 0, direction: "flat" },
        ],
        subtitle: "Past 90 days",
      },
    });

    expect(await screen.findByTestId("linechart")).toBeTruthy();
    // One <Line> per series — this is the first multi-series chart in the app.
    expect(screen.getByText("series:Credential phishing")).toBeTruthy();
    expect(screen.getByText("series:SMS phishing")).toBeTruthy();
    expect(screen.getByText("41%")).toBeTruthy();
    expect(screen.getByText("Stable")).toBeTruthy(); // flat renders as "Stable", not "0%"
  });

  it("renders the campaigns answer as a real table with derived status", async () => {
    await ask({
      data: [
        { id: 1, name: "Microsoft 365 Impersonation", indicatorCount: 84, reportCount: 120, avgScore: 28, band: "dangerous", status: "Active", last_seen: "2026-07-20" },
        { id: 2, name: "LinkedIn Reconnect Lure", indicatorCount: 9, reportCount: 11, avgScore: 71, band: "safe", status: "Contained", last_seen: "2026-07-18" },
      ],
      chartSpec: { type: "table", title: "Active Threat Campaigns", subtitle: "2 campaigns detected" },
    });

    expect(await screen.findByText("Active Threat Campaigns")).toBeTruthy();
    expect(screen.getByText("Avg score")).toBeTruthy();
    expect(screen.getByText("28/100")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Contained")).toBeTruthy();
    // Name appears twice (bar strip + table row), so getAllByText.
    expect(screen.getAllByText("Microsoft 365 Impersonation").length).toBe(2);
  });

  it("renders the score histogram with the REAL band edges (70/35, not the wireframe's 67/34)", async () => {
    await ask({
      data: [
        { label: "0–9", value: 4, band: "dangerous" },
        { label: "90–99", value: 12, band: "safe" },
      ],
      chartSpec: {
        type: "histogram", title: "Orbis Score Distribution",
        bands: [
          { band: "dangerous", label: "Dangerous (0–34)", count: 4, pct: 25 },
          { band: "review", label: "Suspicious (35–69)", count: 0, pct: 0 },
          { band: "safe", label: "Safe (70–100)", count: 12, pct: 75 },
        ],
        subtitle: "16 scored submissions",
      },
    });

    expect(await screen.findByTestId("barchart")).toBeTruthy();
    expect(screen.getByText("Safe (70–100)")).toBeTruthy();
    expect(screen.getByText("Dangerous (0–34)")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("renders the weekly report's totals, stacked bars, top threats and findings", async () => {
    await ask({
      data: {
        totals: { total: 248, dangerous: 35, suspicious: 68, safe: 145 },
        daily: [{ label: "M", dangerous: 5, suspicious: 9, safe: 20 }],
        topThreats: [
          { indicatorId: 1, title: "Fake PayPal login", tag: "Credential phishing", aiScore: 12, band: "dangerous" },
        ],
        findings: [{ text: "23% increase in dangerous links vs last week", direction: "up", pct: 23 }],
      },
      chartSpec: { type: "report", title: "Weekly Threat Report", subtitle: "2026-07-21 → 2026-07-27" },
    });

    expect(await screen.findByText("Weekly Threat Report")).toBeTruthy();
    expect(screen.getByText("248")).toBeTruthy();
    expect(screen.getByText("Daily submissions by verdict")).toBeTruthy();
    // Stacked bars = three series sharing one stackId.
    expect(screen.getByText("series:dangerous")).toBeTruthy();
    expect(screen.getByText("series:safe")).toBeTruthy();
    expect(screen.getByText("Fake PayPal login")).toBeTruthy();
    expect(screen.getByText("Key findings")).toBeTruthy();
    expect(screen.getByText(/23% increase in dangerous links/)).toBeTruthy();
  });
});

describe("Insights — empty states and errors still behave", () => {
  it("shows an empty message for a report with no submissions instead of a broken card", async () => {
    await ask({
      data: { totals: { total: 0, dangerous: 0, suspicious: 0, safe: 0 }, daily: [], topThreats: [], findings: [] },
      chartSpec: { type: "report", title: "Weekly Threat Report", empty: true },
    });
    expect(await screen.findByText(/nothing to report yet/i)).toBeTruthy();
  });

  it("shows an empty message when a generic chart has no rows", async () => {
    await ask({ data: [], chartSpec: { type: "bar", title: "By verdict", empty: true } });
    expect(await screen.findByText(/No submissions match that question yet/i)).toBeTruthy();
  });

  it("still renders the generic count answer (David's original path is untouched)", async () => {
    await ask({ data: [{ label: "Total", value: 42 }], chartSpec: { type: "count", title: "Blacklisted domains" } });
    expect(await screen.findByText("42")).toBeTruthy();
  });

  it("explains a 403 as an analyst-only feature", async () => {
    // api.js throws Object.assign(new Error(...), { status }) on a non-OK response, so a 403 from
    // requireAnalyst reaches the component as an error carrying .status.
    apiPost.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    render(<Insights />);
    await userEvent.type(screen.getByPlaceholderText(/how many dangerous links/i), "q");
    await userEvent.click(screen.getByLabelText("Ask"));
    expect(await screen.findByText(/analyst accounts/i)).toBeTruthy();
  });
});
