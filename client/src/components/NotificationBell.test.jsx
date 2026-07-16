// ============================================================
// Tests for the notification bell in the top bar.
//
// The bell reads its data from useNotifications(). We mock that hook so each
// test can hand the bell an exact { notifications, unreadCount, markAllRead }
// and assert the badge / dropdown / mark-read behavior in isolation.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationBell from "./NotificationBell.jsx";

// Mock the notifications hook the bell consumes.
vi.mock("../context/NotificationsContext.jsx", () => ({
  useNotifications: vi.fn(),
}));
import { useNotifications } from "../context/NotificationsContext.jsx";

const markAllRead = vi.fn();

// Set what useNotifications() returns for a given test.
const setContext = ({ notifications = [], unreadCount = 0 } = {}) => {
  useNotifications.mockReturnValue({ notifications, unreadCount, markAllRead });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationBell", () => {
  it("shows the unread badge with the count when there are unread items", () => {
    setContext({ unreadCount: 3, notifications: [{ id: 1, message: "A", is_read: false }] });
    render(<NotificationBell />);
    expect(screen.getByText("3")).toBeInTheDocument();
    // The accessible label also reports the count.
    expect(screen.getByLabelText("Notifications (3 unread)")).toBeInTheDocument();
  });

  it("hides the badge when there are no unread items", () => {
    setContext({ unreadCount: 0 });
    render(<NotificationBell />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("opens the dropdown and marks everything read on open", async () => {
    const user = userEvent.setup();
    setContext({ unreadCount: 2, notifications: [{ id: 1, message: "Verdict confirmed", is_read: false }] });
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    // Opening reveals the dropdown (header + the row message)...
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Verdict confirmed")).toBeInTheDocument();
    // ...and clears the badge by marking all read.
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when there are no notifications", async () => {
    const user = userEvent.setup();
    setContext({ unreadCount: 0, notifications: [] });
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    // No unread items → markAllRead should not be called.
    expect(markAllRead).not.toHaveBeenCalled();
  });
});
