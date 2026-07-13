import { createContext, useContext, useState } from "react";

// App-wide notifications so the bell badge shows on any page.
// TODO(Ozias): fetch GET /api/notifications, poll or refresh on closure events.
const NotificationsContext = createContext({ notifications: [], unreadCount: 0, refresh: () => {} });

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const value = { notifications, unreadCount, setNotifications, refresh: () => {} };
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
