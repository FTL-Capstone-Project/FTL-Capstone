import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../lib/api.js";
import { POLL_INTERVAL_MS } from "../config/constants.js";

// App-wide notifications so the bell badge shows on any page.
// O6: polls GET /api/notifications on a timer so closure alerts (story #7)
// appear without a page refresh.

// TEMP mock notifications (O5) — used only as a fallback while the real
// GET /api/notifications is still a stub returning an empty list. The shape
// matches the `notifications` table (§5): id, type, message, is_read, created_at.
// DELETE this fallback once the backend returns real rows (Phase 3).
const MOCK_NOTIFICATIONS = [
  { id: 1, type: "verdict_confirmed", message: "An analyst confirmed your PayPal report as malicious.", is_read: false, created_at: "2h ago" },
  { id: 2, type: "verdict_confirmed", message: "Your Microsoft 365 sign-in report is now under review.", is_read: false, created_at: "5h ago" },
  { id: 3, type: "verdict_confirmed", message: "An analyst confirmed the HR benefits email is safe.", is_read: true, created_at: "1d ago" },
];

const NotificationsContext = createContext({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  refresh: () => {},
});

export function NotificationsProvider({ children }) {
  const { getToken } = useAuth();
  const [notifications, setNotifications] = useState([]);

  // Derived value: how many are still unread. Recomputed every render, so the
  // badge always matches the list — no separate counter to keep in sync.
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Fetch my notifications from the backend. Falls back to mock data while the
  // API is still a stub (empty list), so the bell has something to show today.
  async function refresh() {
    try {
      const data = await api.get("/api/notifications", { getToken });
      setNotifications(data.notifications?.length ? data.notifications : MOCK_NOTIFICATIONS);
    } catch {
      setNotifications(MOCK_NOTIFICATIONS);
    }
  }

  // Poll on load, then every POLL_INTERVAL_MS. The interval is cleared when the
  // provider unmounts so we don't leak timers.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark every notification read (called when the dropdown opens). TODO(Ozias):
  // also PATCH /api/notifications/:id/read on the backend (O8) so it persists.
  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const value = { notifications, unreadCount, markAllRead, refresh };
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
