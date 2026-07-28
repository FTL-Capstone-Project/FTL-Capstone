// ── analyst triage queue · component test · owner: Ozias ── (card G1·05)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const apiGet = vi.fn();
vi.mock("../../lib/api.js", () => ({ api: { get: (...a) => apiGet(...a) } }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ getToken: async () => "t" }) }));
// Keep the test focused on the queue: stub the detail modal to a marker.
vi.mock("./ReportDetailModal.jsx", () => ({ default: () => <div data-testid="modal" /> }));

const { default: TriageQueue } = await import("./TriageQueue.jsx");

// TriageQueue makes TWO api.get calls on mount (the history queue and the campaigns list) and a
// THIRD when the analyst searches. This helper routes each URL to the right canned response.
const mockApi = ({ reports = [], campaigns = [], searchResults = [], truncated = false }) => {
  apiGet.mockImplementation((path) => {
    if (path.startsWith("/api/campaigns")) return Promise.resolve({ campaigns });
    if (path.startsWith("/api/search")) return Promise.resolve({ reports: searchResults, truncated });
    return Promise.resolve({ reports });
  });
}

// The queue reads ?q= (so the sidebar search bar can deep-link into results), which means it needs
// router context. `at` seeds the URL for the deep-link tests.
const renderQueue = (at = "/reports") =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <TriageQueue />
    </MemoryRouter>
  );

// Four org reports across review states, in arbitrary source order so the sort has work to do.
const rows = [
  { indicator_id: 1, title: "HR benefits (safe)",   ai_score: 94, created_at: "2026-07-05", review: { review_status: "confirmed safe", human_score: 94 } },
  { indicator_id: 2, title: "FedEx (pending)",      ai_score: 54, created_at: "2026-07-06", review: { review_status: "pending review" } },
  { indicator_id: 3, title: "PayPal (confirmed)",   ai_score: 22, created_at: "2026-07-08", review: { review_status: "confirmed malicious", human_score: 18 } },
  { indicator_id: 4, title: "Microsoft (investigating)", ai_score: 31, created_at: "2026-07-07", review: { review_status: "investigating" } },
];

beforeEach(() => {
  apiGet.mockReset();
  mockApi({ reports: rows, campaigns: [] }); // default: no campaigns → ungrouped
});

// Read the rendered report titles top-to-bottom (headings inside ReportCard).
const renderedTitles = () =>
  screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("TriageQueue", () => {
  it("requests the analyst org queue (org=1&all=1)", async () => {
    renderQueue();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/history?org=1&all=1", expect.any(Object)));
  });

  it("priority-orders: open items first, most dangerous first, within groups", async () => {
    renderQueue();
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
    renderQueue();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    await user.click(screen.getByRole("button", { name: /pending review/i }));

    // Only the two open items remain, still priority-ordered.
    expect(renderedTitles()).toEqual(["Microsoft (investigating)", "FedEx (pending)"]);
  });

  it("clusters same-campaign reports under one collapsible campaign header (G1·06)", async () => {
    // PayPal (3) and Microsoft (4) both belong to campaign 1; the other two are ungrouped.
    const campaignRows = rows.map((r) =>
      r.indicator_id === 3 || r.indicator_id === 4
        ? { ...r, review: { ...r.review, campaign_id: 1 } }
        : r
    );
    mockApi({ reports: campaignRows, campaigns: [{ id: 1, name: "Bank impersonation" }] });

    const user = userEvent.setup();
    renderQueue();

    // The campaign header shows, collapsed → its 2 reports' titles are NOT in the DOM yet.
    await waitFor(() => expect(screen.getByText("Bank impersonation")).toBeInTheDocument());
    expect(screen.getByText("2 reports")).toBeInTheDocument();
    expect(screen.queryByText("PayPal (confirmed)")).not.toBeInTheDocument();

    // The two UNGROUPED reports still render as normal rows.
    expect(screen.getByText("FedEx (pending)")).toBeInTheDocument();
    expect(screen.getByText("HR benefits (safe)")).toBeInTheDocument();

    // Expand the campaign → its member reports appear.
    await user.click(screen.getByRole("button", { name: /bank impersonation/i }));
    expect(screen.getByText("PayPal (confirmed)")).toBeInTheDocument();
    expect(screen.getByText("Microsoft (investigating)")).toBeInTheDocument();
  });
});

// ── keyword search over the org's threat history (David) ──────────────────────
// The queue only ever showed the newest reports, so "have we seen this domain before?" meant
// scrolling. These cover the search box + the ?q= deep link the sidebar bar uses.
describe("TriageQueue — search", () => {
  const searchBox = () => screen.getByLabelText(/search your organization's threat history/i);
  const hit = { indicator_id: 9, title: "Old PayPal report", ai_score: 12, created_at: "2026-06-01", review: null };

  it("does NOT search on a single character (too broad — the server rejects it too)", async () => {
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    await user.type(searchBox(), "p");
    // Give the debounce time to fire if it were going to.
    await new Promise((r) => setTimeout(r, 400));
    expect(apiGet).not.toHaveBeenCalledWith(expect.stringContaining("/api/search"), expect.any(Object));
    expect(renderedTitles()).toHaveLength(4); // still the queue
  });

  it("searches on 2+ characters and replaces the queue with the results", async () => {
    mockApi({ reports: rows, campaigns: [], searchResults: [hit] });
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    await user.type(searchBox(), "paypal");

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/search?q=paypal", expect.any(Object)));
    // The result replaces the queue rows — a search result IS a report card.
    await waitFor(() => expect(renderedTitles()).toEqual(["Old PayPal report"]));
    expect(screen.getByText(/1 result for "paypal"/i)).toBeInTheDocument();
  });

  it("URL-encodes the term so a slash or space can't break the query string", async () => {
    mockApi({ reports: rows, campaigns: [], searchResults: [] });
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    await user.type(searchBox(), "a b/c");

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/search?q=a%20b%2Fc", expect.any(Object)));
  });

  it("says so plainly when nothing matches", async () => {
    mockApi({ reports: rows, campaigns: [], searchResults: [] });
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    await user.type(searchBox(), "zzzz");

    await waitFor(() => expect(screen.getByText(/nothing in your organization's history matches/i)).toBeInTheDocument());
  });

  it("clearing the search returns to the queue", async () => {
    mockApi({ reports: rows, campaigns: [], searchResults: [hit] });
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));

    await user.type(searchBox(), "paypal");
    await waitFor(() => expect(renderedTitles()).toEqual(["Old PayPal report"]));

    await user.click(screen.getByRole("button", { name: /back to queue/i }));

    await waitFor(() => expect(renderedTitles()).toHaveLength(4)); // the full queue is back
  });

  it("runs the search straight away when deep-linked with ?q= (the sidebar search bar)", async () => {
    mockApi({ reports: rows, campaigns: [], searchResults: [hit] });
    renderQueue("/reports?q=paypal");

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/search?q=paypal", expect.any(Object)));
    await waitFor(() => expect(renderedTitles()).toEqual(["Old PayPal report"]));
    expect(searchBox()).toHaveValue("paypal"); // the box reflects the deep-linked term
  });

  it("warns that results were capped instead of implying the list is complete", async () => {
    mockApi({ reports: rows, campaigns: [], searchResults: [hit], truncated: true });
    renderQueue("/reports?q=paypal");

    await waitFor(() => expect(screen.getByText(/narrow your search to see more/i)).toBeInTheDocument());
  });
});

describe("TriageQueue — load states", () => {
  it("a FAILED queue fetch shows an error + Try again, NOT the empty-queue message", async () => {
    // The bug this guards: a failed fetch used to fall through to "No reports in your organization
    // yet", telling an analyst with a real backlog their queue was empty. It must read as an error.
    apiGet.mockImplementation((path) => {
      if (path.startsWith("/api/campaigns")) return Promise.resolve({ campaigns: [] });
      return Promise.reject(new Error("network down"));
    });
    renderQueue();

    await waitFor(() => expect(screen.getByText(/couldn't load the triage queue/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/no reports in your organization yet/i)).not.toBeInTheDocument();
  });

  it("Try again re-fetches and renders the queue on recovery", async () => {
    let calls = 0;
    apiGet.mockImplementation((path) => {
      if (path.startsWith("/api/campaigns")) return Promise.resolve({ campaigns: [] });
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("blip")) : Promise.resolve({ reports: rows });
    });
    const user = userEvent.setup();
    renderQueue();

    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(4));
  });
});
