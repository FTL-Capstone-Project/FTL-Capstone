// ============================================================
// Tests for the notifications context (polling + unread derivation + persist-read).
//
// The provider polls GET /api/notifications on a timer and exposes
// { notifications, unreadCount, markAllRead, refresh }. We mock the api layer
// so no real network happens, and mock Clerk's useAuth (getToken) since there's
// no Clerk provider in the test.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { NotificationsProvider, useNotifications } from "./NotificationsContext.jsx";

// Clerk isn't running in tests — stub useAuth so getToken() is a no-op.
// Stable getToken reference (defined inside the hoisted factory).
vi.mock("@clerk/clerk-react", () => {
  const getToken = async () => "test-token";
  return { useAuth: () => ({ getToken }) };
});

// Mock the single API wrapper. get() backs the poll; patch() is the persist-read call.
vi.mock("../lib/api.js", () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}));
import { api } from "../lib/api.js";

// A tiny consumer that prints the context values so tests can assert on them.
const Probe = () => {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  return (
    <div>
      <span data-testid="count">{unreadCount}</span>
      <span data-testid="total">{notifications.length}</span>
      <button onClick={markAllRead}>mark</button>
    </div>
  );
};

const renderProvider = () =>
  render(
    <NotificationsProvider>
      <Probe />
    </NotificationsProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.patch.mockResolvedValue({}); // default: PATCH succeeds
});

describe("NotificationsContext", () => {
  it("fetches on mount and derives unreadCount from unread rows", async () => {
    api.get.mockResolvedValue({
      notifications: [
        { id: 1, message: "A", is_read: false },
        { id: 2, message: "B", is_read: true },
        { id: 3, message: "C", is_read: false },
      ],
    });

    renderProvider();

    // After the initial refresh resolves, we have 3 total and 2 unread.
    await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("3"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(api.get).toHaveBeenCalledWith("/api/notifications", expect.any(Object));
  });

  it("keeps an empty list when the fetch fails (no crash)", async () => {
    api.get.mockRejectedValue(new Error("network down"));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("0"));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("markAllRead clears unread AND persists each one via PATCH (O8)", async () => {
    // Two unread + one already-read. markAllRead should PATCH ONLY the two unread ids.
    api.get.mockResolvedValue({
      notifications: [
        { id: 1, message: "A", is_read: false },
        { id: 2, message: "B", is_read: false },
        { id: 3, message: "C", is_read: true },
      ],
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));

    await act(async () => {
      screen.getByText("mark").click();
    });

    // Optimistic local update: badge clears immediately.
    expect(screen.getByTestId("count").textContent).toBe("0");

    // Persisted: one PATCH per previously-unread id, none for the already-read one.
    expect(api.patch).toHaveBeenCalledTimes(2);
    expect(api.patch).toHaveBeenCalledWith("/api/notifications/1/read", undefined, expect.any(Object));
    expect(api.patch).toHaveBeenCalledWith("/api/notifications/2/read", undefined, expect.any(Object));
  });

  it("keeps the optimistic read state even if a PATCH fails (poll re-syncs later)", async () => {
    api.get.mockResolvedValue({ notifications: [{ id: 1, message: "A", is_read: false }] });
    api.patch.mockRejectedValue(new Error("save failed"));

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("mark").click();
    });

    // The UI still shows read (we don't roll back); the failure is swallowed.
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(api.patch).toHaveBeenCalledTimes(1);
  });

  it("re-polls on the interval timer", async () => {
    vi.useFakeTimers();
    // First poll returns 1 unread; the second poll returns 2 unread.
    api.get
      .mockResolvedValueOnce({ notifications: [{ id: 1, is_read: false }] })
      .mockResolvedValueOnce({ notifications: [{ id: 1, is_read: false }, { id: 2, is_read: false }] });

    renderProvider();

    // Flush the initial fetch (mount effect).
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId("count").textContent).toBe("1");

    // Advance past the poll interval to trigger the second fetch.
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(api.get).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
