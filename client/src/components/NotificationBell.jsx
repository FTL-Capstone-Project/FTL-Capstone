import { useNotifications } from "../context/NotificationsContext.jsx";

// Bell + unread count in the top bar. TODO(Ozias): dropdown list + mark-read on open.
export default function NotificationBell() {
  const { unreadCount } = useNotifications();
  return (
    <button style={{ position: "relative", background: "none", border: "none", cursor: "pointer", fontSize: "1.2em" }}
      aria-label={`Notifications (${unreadCount} unread)`}>
      🔔
      {unreadCount > 0 && (
        <span style={{ position: "absolute", top: -4, right: -4, background: "var(--danger)",
          color: "#fff", fontSize: "0.6em", fontWeight: 700, borderRadius: 999, padding: "1px 5px" }}>
          {unreadCount}
        </span>
      )}
    </button>
  );
}
