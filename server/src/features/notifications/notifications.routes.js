// ── feature: notifications · owner: Ozias ──
// GET /api/notifications — my closure alerts. PATCH /:id/read — clear the bell badge. §6.
//
// These are the OUTPUT side of my slice: the analyst confirms a verdict →
// createNotification() writes a row (see notifications.service.js) → this GET
// serves it → NotificationBell shows the badge (story #7 "closure loop").
//
// DB rows are camelCase (Prisma). The frontend (NotificationsContext) reads
// snake_case — is_read, created_at — so we translate on the way out. That keeps
// one field-naming contract across the whole app (same one David's API uses).
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db.js";
import { listNotifications, markNotificationRead } from "./notifications.service.js";

export const notificationsRouter = Router();

// Shape ONE Prisma notification row into the JSON the bell expects.
const toNotificationJson = (n) => {
  return {
    id: n.id,
    type: n.type,
    message: n.message,
    indicator_id: n.indicatorId,
    is_read: n.isRead,
    created_at: n.createdAt,
  };
}

// GET /api/notifications — all of the signed-in user's alerts, newest first.
// requireAuth guarantees req.user.id is the verified caller, so we only ever
// read that user's rows (story #12 isolation).
notificationsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const rows = await listNotifications(prisma, req.user.id);
    const notifications = rows.map(toNotificationJson);
    const unreadCount = notifications.filter((n) => !n.is_read).length;
    return res.json({ notifications, unreadCount });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/notifications/:id/read — mark one alert read (clears the badge).
// The service enforces ownership; we map its result to the right HTTP status.
notificationsRouter.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid notification id" });
    }

    const result = await markNotificationRead(prisma, { id, userId: req.user.id });
    if (result.status === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result.status === "forbidden") {
      // It exists but belongs to someone else — never confirm which (§12).
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json(toNotificationJson(result.notification));
  } catch (err) {
    return next(err);
  }
});
