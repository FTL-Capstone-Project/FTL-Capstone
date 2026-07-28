import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../lib/api.js";
import { NOTIFICATION_POLL_MS } from "../config/constants.js";

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

// Cheap identity for a notification list: only the id + read flag can change what the bell renders.
// We compare this instead of the array reference, because the API hands back a BRAND-NEW array on
// every poll — so `setNotifications(data)` re-rendered every consumer on a fixed timer even when
// nothing had actually changed. Joining ids is fine at bell scale (a handful of rows).
const listSignature = (rows) => rows.map((n) => `${n.id}:${n.is_read ? 1 : 0}`).join(",");

export const NotificationsProvider = ({ children }) => {
  const { getToken } = useAuth();
  const [notifications, setNotifications] = useState([]);
  // The AUTHORITATIVE unread count comes from the server, not from counting the list — because the
  // list is capped (server returns at most NOTIFICATION_LIMIT rows). If a user has more unread than
  // the cap, counting the visible rows would understate the badge (show 50 when there are 55). The
  // server sends the true count alongside the capped page, so we trust it.
  const [unreadCount, setUnreadCount] = useState(0);

  // The polling loop used to close over the FIRST render's getToken and keep it forever (the effect
  // had [] deps), so a rotated Clerk token would never reach the fetch. Keep it in a ref that each
  // render refreshes, so the timer always calls the current one without re-arming the interval.
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  // Fetch my notifications from the backend. On error, keep the list we already have rather than
  // blanking it: a single failed poll (sleeping laptop, cold API) shouldn't make the user's alerts
  // vanish and then reappear on the next tick.
  const refresh = useCallback(async () => {
    try {
      const data = await api.get("/api/notifications", { getToken: getTokenRef.current });
      const next = data.notifications ?? [];
      // Only touch state when something really changed — otherwise every consumer re-renders on a
      // timer for no visible reason.
      setNotifications((prev) => (listSignature(prev) === listSignature(next) ? prev : next));
      // Prefer the server's count; fall back to counting the (capped) list only if it's absent.
      setUnreadCount(typeof data.unreadCount === "number"
        ? data.unreadCount
        : next.filter((n) => !n.is_read).length);
    } catch {
      // Intentionally no setNotifications/​setUnreadCount here (see above).
    }
  }, []);

  // Poll on load, then every NOTIFICATION_POLL_MS — and only while the tab is actually VISIBLE.
  // The old version polled every 1.5s forever, including in background tabs nobody was looking at,
  // which is what made this ~40 requests/minute/user of continuous load. Pausing on hidden and
  // refreshing on focus means a returning user still sees fresh alerts immediately.
  useEffect(() => {
    let timer = null;

    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => {
      stop();                                    // never stack intervals
      timer = setInterval(refresh, NOTIFICATION_POLL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        refresh();  // catch up on whatever arrived while we were hidden
        start();
      }
    };

    refresh();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refresh]);

  // Mark every notification read (called when the dropdown opens). We flip local state immediately
  // (optimistic → snappy UI) AND persist via ONE bulk call. Using the bulk endpoint (not a PATCH per
  // visible id) is what makes this correct now that the list is capped: it clears EVERY unread row
  // server-side, including any older than the NOTIFICATION_LIMIT window — a per-id loop over the
  // shown rows could never reach those, leaving the server's unread count stuck above zero forever.
  // Persisting is best-effort: if it fails, the next poll re-syncs from the server.
  const markAllRead = useCallback(() => {
    if (unreadCount === 0) return; // nothing unread → don't touch state or the network

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0); // optimistic — the badge clears instantly

    api.patch("/api/notifications/read-all", undefined, { getToken: getTokenRef.current }).catch(() => {
      // Non-fatal: leave the optimistic state; the poll re-syncs from the server.
    });
  }, [unreadCount]);

  // Memoized so the context value keeps a stable identity between polls that changed nothing.
  // A fresh object literal here would re-render every consumer on each provider render, undoing the
  // "only update when the list actually changed" work above.
  const value = useMemo(
    () => ({ notifications, unreadCount, markAllRead, refresh }),
    [notifications, unreadCount, markAllRead, refresh]
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => {
  return useContext(NotificationsContext);
}
