import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../lib/api.js";
import { POLL_INTERVAL_MS } from "../config/constants.js";

// App-wide notifications so the bell badge shows on any page.
// O6: polls GET /api/notifications on a timer so closure alerts (story #7)
// appear without a page refresh. Rows come from the real API (backed by the
// notifications table, §5): id, type, message, is_read, created_at.

const NotificationsContext = createContext({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  refresh: () => {},
});

export const NotificationsProvider = ({ children }) => {
  const { getToken } = useAuth();
  const [notifications, setNotifications] = useState([]);

  // Derived value: how many are still unread. Recomputed every render, so the
  // badge always matches the list — no separate counter to keep in sync.
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Fetch my notifications from the backend. On error, keep an empty list so the
  // bell simply shows no alerts rather than crashing.
  const refresh = async () => {
    try {
      const data = await api.get("/api/notifications", { getToken });
      setNotifications(data.notifications ?? []);
    } catch {
      setNotifications([]);
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
  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const value = { notifications, unreadCount, markAllRead, refresh };
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => {
  return useContext(NotificationsContext);
}
