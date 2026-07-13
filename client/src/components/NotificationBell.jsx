import { useState } from "react";
import { Bell, CheckCircle } from "lucide-react";
import { useNotifications } from "../context/NotificationsContext.jsx";

// Bell + unread count in the top bar, with a dropdown list of notifications (O5).
// Opening the dropdown marks everything read (clears the badge) — story #7 closure.
export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false); // is the dropdown showing?

  // Toggle the dropdown. When we OPEN it, mark everything read so the badge clears.
  function toggleOpen() {
    if (!open && unreadCount > 0) markAllRead();
    setOpen((prev) => !prev);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={toggleOpen}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", color: "var(--navy)" }}
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "var(--danger)",
            color: "#fff", fontSize: "0.6em", fontWeight: 700, borderRadius: 999, padding: "1px 5px" }}>
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Invisible full-screen layer: clicking anywhere outside closes the dropdown. */}
          <div onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10 }} />

          <div style={{ position: "absolute", right: 0, top: "130%", width: 300, zIndex: 20,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
            boxShadow: "var(--shadow)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", fontWeight: 700, color: "var(--navy)",
              borderBottom: "1px solid var(--border)" }}>
              Notifications
            </div>

            {notifications.length === 0 ? (
              <p style={{ padding: "14px", margin: 0, fontSize: "0.85em", color: "var(--text-dim)" }}>
                You're all caught up.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 320, overflowY: "auto" }}>
                {notifications.map((n) => (
                  <li key={n.id} style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)",
                    display: "flex", gap: 8 }}>
                    <CheckCircle size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: "0.85em", color: "var(--text)" }}>{n.message}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "0.72em", color: "var(--text-dim)" }}>{n.created_at}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
