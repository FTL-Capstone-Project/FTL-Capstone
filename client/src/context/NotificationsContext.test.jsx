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
// Read the real interval instead of hardcoding it — this test used to assert on a literal 1500ms and
// broke the moment the bell was slowed down (deliberately) to cut continuous request load.
import { NOTIFICATION_POLL_MS } from "../config/constants.js";

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
  it("fetches on mount and shows the server's unreadCount", async () => {
    api.get.mockResolvedValue({
      notifications: [
        { id: 1, message: "A", is_read: false },
        { id: 2, message: "B", is_read: true },
        { id: 3, message: "C", is_read: false },
      ],
      unreadCount: 2,
    });

    renderProvider();

    // After the initial refresh resolves, we have 3 total and 2 unread.
    await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("3"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(api.get).toHaveBeenCalledWith("/api/notifications", expect.any(Object));
  });

  it("trusts the server's unreadCount even when it EXCEEDS the returned (capped) list", async () => {
    // The bug this guards: the list is capped server-side, so a user with 55 unread gets only ~50
    // rows back. Counting the visible rows would show 50; the true badge is 55, sent as unreadCount.
    api.get.mockResolvedValue({
      notifications: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, message: "n", is_read: false })),
      unreadCount: 55,
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("55"));
    expect(screen.getByTestId("total").textContent).toBe("50"); // list is capped, badge is not
  });

  it("falls back to counting the list only when the server omits unreadCount", async () => {
    api.get.mockResolvedValue({
      notifications: [{ id: 1, is_read: false }, { id: 2, is_read: false }, { id: 3, is_read: true }],
      // no unreadCount field
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
  });

  it("keeps an empty list when the fetch fails (no crash)", async () => {
    api.get.mockRejectedValue(new Error("network down"));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("0"));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("a failed poll does NOT wipe alerts we already had on screen", async () => {
    vi.useFakeTimers();
    // First poll succeeds with two rows; the next one fails (cold API / sleeping laptop).
    api.get
      .mockResolvedValueOnce({ notifications: [{ id: 1, is_read: false }, { id: 2, is_read: false }] })
      .mockRejectedValueOnce(new Error("network blip"));

    renderProvider();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId("total").textContent).toBe("2");

    await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS); });
    // The old code blanked the list on any error, so alerts flickered away and back. They must persist.
    expect(screen.getByTestId("total").textContent).toBe("2");

    vi.useRealTimers();
  });

  it("markAllRead clears unread AND persists via ONE bulk call (O8)", async () => {
    api.get.mockResolvedValue({
      notifications: [
        { id: 1, message: "A", is_read: false },
        { id: 2, message: "B", is_read: false },
        { id: 3, message: "C", is_read: true },
      ],
      unreadCount: 2,
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));

    await act(async () => {
      screen.getByText("mark").click();
    });

    // Optimistic local update: badge clears immediately.
    expect(screen.getByTestId("count").textContent).toBe("0");

    // Persisted with a SINGLE bulk call — not one-per-id. This is what lets it clear unread rows that
    // fall outside the capped list window (a per-visible-id loop never could).
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith("/api/notifications/read-all", undefined, expect.any(Object));
  });

  it("markAllRead can clear MORE unread than the visible list (past the cap)", async () => {
    // 50 rows shown but 55 unread server-side. The single bulk call clears all 55; the badge goes to 0.
    api.get.mockResolvedValue({
      notifications: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, is_read: false })),
      unreadCount: 55,
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("55"));

    await act(async () => { screen.getByText("mark").click(); });

    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith("/api/notifications/read-all", undefined, expect.any(Object));
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
    await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS); });
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(api.get).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("PAUSES polling while the tab is hidden, and catches up on focus", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue({ notifications: [{ id: 1, is_read: false }] });

    renderProvider();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.get).toHaveBeenCalledTimes(1); // mount fetch

    // Hide the tab: the interval must stop, so time passing costs us nothing.
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS * 4); });
    expect(api.get).toHaveBeenCalledTimes(1); // still 1 — nothing polled in the background

    // Come back: refresh immediately so the user isn't staring at stale alerts.
    hidden.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(api.get).toHaveBeenCalledTimes(2);

    hidden.mockRestore();
    vi.useRealTimers();
  });

  it("an unchanged poll result doesn't churn state (no pointless re-renders)", async () => {
    vi.useFakeTimers();
    let renders = 0;
    const CountRenders = () => { useNotifications(); renders += 1; return null; };
    // Same rows every time, but a NEW array each call — exactly what the API does.
    api.get.mockImplementation(async () => ({ notifications: [{ id: 1, is_read: false }] }));

    render(<NotificationsProvider><CountRenders /></NotificationsProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const afterFirst = renders;

    // Three more polls that change nothing.
    await act(async () => { await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS * 3); });
    expect(api.get).toHaveBeenCalledTimes(4);
    // Consumers must NOT re-render just because a timer fired with identical data.
    expect(renders).toBe(afterFirst);

    vi.useRealTimers();
  });

  it("markAllRead with nothing unread makes no network calls", async () => {
    api.get.mockResolvedValue({ notifications: [{ id: 1, is_read: true }] });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("1"));

    await act(async () => { screen.getByText("mark").click(); });

    expect(api.patch).not.toHaveBeenCalled();
  });
});
