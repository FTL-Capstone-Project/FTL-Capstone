// ── campaign detail page · component test · owner: Ozias ── (extends card G1·06)
// CampaignDetail reads :campaignId out of the URL and fetches GET /api/campaigns/:id.
// We render it inside a real <Routes> (not a bare MemoryRouter) — with no matching route
// useParams() would be empty and the tests would pass for the wrong reason.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const apiGet = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { get: (...a) => apiGet(...a) } }));
// getToken must be a STABLE reference (defined once in the factory): the fetch effect
// depends on it, so a fresh function each render would re-run it forever.
vi.mock("@clerk/clerk-react", () => {
  const getToken = async () => "test-token";
  return { useAuth: () => ({ getToken }) };
});
// Keep the test on the page itself: the detail modal has its own tests.
vi.mock("./ReportDetailModal.jsx", () => ({ default: () => <div data-testid="modal" /> }));

const { default: CampaignDetail } = await import("./CampaignDetail.jsx");

// Two reports clustered in one campaign, in the history row shape the endpoint returns.
const detail = {
  campaign: {
    id: 1,
    name: "Brand impersonation",
    shared_signal: "brand-lookalike login domains",
    first_seen: "2026-07-01",
    last_seen: "2026-07-08",
    indicatorCount: 2,
  },
  indicators: [
    { indicator_id: 10, title: "Fake PayPal login", ai_score: 22, created_at: "2026-07-06",
      review: { review_status: "confirmed malicious", human_score: 18 } },
    { indicator_id: 11, title: "Fake Microsoft 365 sign-in", ai_score: 31, created_at: "2026-07-07",
      review: { review_status: "investigating" } },
  ],
  reportCount: 2,
};

// Render at a URL that matches the real route, so useParams() gets a campaignId.
const renderAt = (path = "/reports/campaigns/1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports/campaigns/:campaignId" element={<CampaignDetail />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockResolvedValue(detail);
});

describe("CampaignDetail", () => {
  it("fetches the campaign id from the URL", async () => {
    renderAt("/reports/campaigns/7");
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/campaigns/7", expect.any(Object)));
  });

  it("shows the campaign name and its shared signal", async () => {
    renderAt();
    expect(await screen.findByRole("heading", { name: "Brand impersonation" })).toBeInTheDocument();
    expect(screen.getByText(/brand-lookalike login domains/i)).toBeInTheDocument();
  });

  it("renders one report card per indicator in the campaign", async () => {
    renderAt();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2));
    expect(screen.getByText("Fake PayPal login")).toBeInTheDocument();
    expect(screen.getByText("Fake Microsoft 365 sign-in")).toBeInTheDocument();
  });

  it("omits the shared-signal line when the campaign has none (it's nullable)", async () => {
    apiGet.mockResolvedValue({ ...detail, campaign: { ...detail.campaign, shared_signal: null } });
    renderAt();
    await screen.findByRole("heading", { name: "Brand impersonation" });
    expect(screen.queryByText(/shared signal/i)).not.toBeInTheDocument();
  });

  it("shows a friendly message when the fetch fails (404 / wrong org)", async () => {
    apiGet.mockRejectedValue(new Error("not found"));
    renderAt();
    expect(await screen.findByText(/couldn't load that campaign/i)).toBeInTheDocument();
  });

  it("shows an empty state for a campaign with no renderable reports", async () => {
    apiGet.mockResolvedValue({ campaign: { ...detail.campaign, indicatorCount: 0 }, indicators: [], reportCount: 0 });
    renderAt();
    expect(await screen.findByText(/no reports are clustered/i)).toBeInTheDocument();
  });

  it("treats a junk id in the URL as not-found without calling the API", async () => {
    renderAt("/reports/campaigns/abc");
    expect(await screen.findByText(/couldn't load that campaign/i)).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
